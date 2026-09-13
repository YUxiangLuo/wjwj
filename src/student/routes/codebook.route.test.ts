import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createMockDb } from "@/test-utils/mock-db";
import { createStudentAuthModuleMock, createTeacherAuthModuleMock } from "@/test-utils/mock-auth-modules";
const record = { id: 20, taskId: 40, version: 8, status: "submitted", submissionSnapshot: { marker: "frozen" }, questionnaire: { marker: "saved" }, samplingResults: { marker: "indices" }, variableDictionary: { marker: "confirmed" }, variableDictionaryRevision: 3, excelFilePath: "/storage/owned.csv", fieldMapping: { identifier: "id", numeric: [] }, populationSize: 4 };
function req(role: "student" | "teacher", format = "xlsx") { const request = new Request(`https://example.test/api/${role}/export?type=all&format=${format}`) as Request & { params: { id: string } }; request.params = { id: role === "student" ? "40" : "20" }; return request; }
async function setup(role: "student" | "teacher", select: unknown[], anonymous = false) {
    const { db, operations } = createMockDb({ select });
    mock.module("@/db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock(anonymous ? { requireAuth: async () => ({ error: Response.json({}, { status: 401 }) }) } : {}));
    mock.module("@/teacher/routes/auth", () => createTeacherAuthModuleMock());
    const access = mock(async (_taskId: number, classId: number) => classId === 7 ? null : Response.json({}, { status: 403 }));
    mock.module("../experiment/task-access", () => ({ getStudentTaskAccessError: access, getStudentTopicAttachmentAccessError: async () => null }));
    const download = mock(async (_job: any, _signal: any, authorize: () => Promise<Response | null | undefined>) => await authorize() ?? new Response("PK"));
    mock.module("../experiment/codebook-service", () => ({ codebookDownload: download }));
    const route = role === "student" ? (await import(`./files?codebook=${Math.random()}`)).exportRoutes : (await import(`../../teacher/routes/grading?codebook=${Math.random()}`)).gradingSamplingExportRoutes;
    return { route, operations, access, download };
}
test("student XLSX forwards authoritative record metadata and rechecks class membership", async () => {
    const { route, download, operations, access } = await setup("student", [[record], [{ classId: 7 }]]);
    expect((await route.GET!(req("student"))).status).toBe(200);
    expect(download.mock.calls[0]![0]).toMatchObject({ ...record, experimentId: 20, taskId: 40, type: "all" });
    expect(access).toHaveBeenCalledTimes(2);
    expect(new PgDialect().sqlToQuery(operations[0]!.where as SQL).params).toEqual([11, 40]);
});
test("student transfer during generation denies the completed file", async () => {
    const { route, download } = await setup("student", [[record], [{ classId: 8 }]]);
    expect((await route.GET!(req("student"))).status).toBe(403); expect(download).toHaveBeenCalledTimes(1);
});
test("anonymous XLSX export cannot read a record or start a worker", async () => {
    const { route, download, operations } = await setup("student", [], true);
    expect((await route.GET!(req("student"))).status).toBe(401); expect(download).not.toHaveBeenCalled(); expect(operations).toHaveLength(0);
});
test("teacher XLSX forwards frozen source, scopes to own class and rechecks ownership", async () => {
    const { route, operations, download } = await setup("teacher", [[record], [record]]);
    expect((await route.GET!(req("teacher"))).status).toBe(200);
    expect(download.mock.calls[0]![0]).toMatchObject({ taskId: 40, experimentId: 20, submissionSnapshot: record.submissionSnapshot });
    expect(operations.filter(o => o.kind === "select")).toHaveLength(2);
    const query = new PgDialect().sqlToQuery(operations[0]!.where as SQL);
    expect(query.sql).toContain('"class"."teacher_id"'); expect(query.sql).toContain('"student"."class_id" = "task"."class_id"');
});
test("teacher ownership revoked during generation denies the completed file", async () => {
    const { route } = await setup("teacher", [[record], []]); expect((await route.GET!(req("teacher"))).status).toBe(404);
});
test("another teacher's record cannot start generation", async () => {
    const { route, download } = await setup("teacher", []); expect((await route.GET!(req("teacher"))).status).toBe(404); expect(download).not.toHaveBeenCalled();
});
for (const role of ["student", "teacher"] as const) test(`${role} rejects unknown export formats`, async () => {
    const { route, download } = await setup(role, []); expect((await route.GET!(req(role, "legacy"))).status).toBe(400); expect(download).not.toHaveBeenCalled();
});
