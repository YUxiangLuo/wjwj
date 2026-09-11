import { expect, mock, test } from "bun:test";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withClassId(request: Request, classId: string) {
    (request as Request & { params?: Record<string, string> }).params = { classId };
    return request;
}

test("teacher student list omits removed lock state", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ id: 1 }],
        [{ id: 18, studentId: "S018", name: "普通学生", email: null, status: 1 }],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./classroom.ts?student-list=${crypto.randomUUID()}`);

    const response = await module.classStudentsRoutes.GET!(withClassId(
        new Request("https://example.com/api/teacher/classes/1/students"),
        "1",
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        data: [{ studentId: "S018", status: 1 }],
    });

    const selections = operations
        .filter((operation) => operation.kind === "select")
        .map((operation) => operation.selection as Record<string, unknown>);
    expect(selections[1]).not.toHaveProperty("lockedUntil");
});

test("student roster paginates and searches on the server when asked", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ id: 1 }],
        [{ id: 18, studentId: "S2618", name: "普通学生", email: null }],
        [{ count: 513 }],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./classroom.ts?student-page=${crypto.randomUUID()}`);

    const response = await module.classStudentsRoutes.GET!(withClassId(
        new Request("https://example.com/api/teacher/classes/1/students?page=2&pageSize=20&search=普通"),
        "1",
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ total: 513, page: 2, pageSize: 20 });
    expect(payload.data.items).toHaveLength(1);
    // 500-row rosters must not be rendered in one page.
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(3);
});

test("student roster rejects malformed pagination", async () => {
    const { db } = createMockDb({ select: [[{ id: 1 }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./classroom.ts?student-page-bad=${crypto.randomUUID()}`);

    const response = await module.classStudentsRoutes.GET!(withClassId(
        new Request("https://example.com/api/teacher/classes/1/students?page=1.5"),
        "1",
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_PARAM" } });
});
