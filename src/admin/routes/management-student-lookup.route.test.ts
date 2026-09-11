import { expect, mock, test } from "bun:test";
import { auditEvent, experiment, student, userSession } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

async function load(select: unknown[]) {
    const { db, operations } = createMockDb({ select, update: [[{ id: 9 }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        getAdminUser: () => ({ id: 1, username: "admin" }),
        getPrimaryTeacherIdOrThrow: () => 1,
    }));
    const module = await import(`./management.ts?lookup=${crypto.randomUUID()}`);
    return { module, operations };
}

function withParams(request: Request, params: Record<string, string>) {
    return Object.assign(request, { params });
}

test("student lookup reports the owning class, teacher and history", async () => {
    const { module } = await load([
        [{
            id: 9, studentId: "S009", name: "林清", email: "s009@example.edu",
            classId: 7, className: "统计一班", teacherId: 6, teacherName: "教师六", createdAt: new Date(),
        }],
        [{ status: "submitted", count: 2 }, { status: "graded", count: 1 }],
    ]);

    const response = await module.studentLookupRoutes.GET!(
        new Request("https://example.com/api/admin/students/lookup?studentId=S009"),
    );
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data.student).toMatchObject({ studentId: "S009", className: "统计一班", teacherName: "教师六" });
    expect(payload.data.impact).toMatchObject({ experiments: 3, submitted: 2, graded: 1 });
});

test("student lookup rejects an empty student ID without querying", async () => {
    const { module, operations } = await load([]);

    const response = await module.studentLookupRoutes.GET!(
        new Request("https://example.com/api/admin/students/lookup?studentId=%20"),
    );

    expect(response.status).toBe(400);
    expect(operations).toHaveLength(0);
});

test("student lookup answers 404 for an unknown student ID", async () => {
    const { module } = await load([[]]);

    const response = await module.studentLookupRoutes.GET!(
        new Request("https://example.com/api/admin/students/lookup?studentId=S404"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

test("moving a student to another class keeps the account and revokes sessions", async () => {
    const { module, operations } = await load([
        [{ id: 9, classId: 7, studentId: "S009" }],
        [{ id: 8, name: "统计二班", teacherId: 6 }],
    ]);

    const response = await module.studentClassRoutes.PUT!(withParams(new Request(
        "https://example.com/api/admin/students/9/class",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId: 8 }) },
    ), { id: "9" }));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ success: true, moved: true, classId: 8, previousClassId: 7 });
    const update = operations.find((operation) => operation.kind === "update" && operation.table === student);
    expect(update?.set).toMatchObject({ classId: 8 });
    // The class is part of the student's identity, so sessions must be cleared.
    expect(operations.some((operation) => operation.kind === "delete" && operation.table === userSession)).toBe(true);
    const audit = operations.find((operation) => operation.kind === "insert" && operation.table === auditEvent);
    expect(audit?.values).toMatchObject({ action: "student.class_changed", entityType: "student", entityId: 9 });
    expect(operations.some((operation) => operation.kind === "delete" && operation.table === experiment)).toBe(false);
});

test("moving a student into the class they already belong to is a no-op", async () => {
    const { module, operations } = await load([
        [{ id: 9, classId: 7, studentId: "S009" }],
        [{ id: 7, name: "统计一班", teacherId: 6 }],
    ]);

    const response = await module.studentClassRoutes.PUT!(withParams(new Request(
        "https://example.com/api/admin/students/9/class",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId: 7 }) },
    ), { id: "9" }));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ success: true, moved: false, classId: 7 });
    expect(operations.some((operation) => operation.kind === "update")).toBe(false);
    expect(operations.some((operation) => operation.kind === "delete")).toBe(false);
});

test("moving a student rejects an unknown class and an invalid payload", async () => {
    const { module } = await load([[{ id: 9, classId: 7, studentId: "S009" }], []]);

    const request = (body: unknown) => withParams(new Request(
        "https://example.com/api/admin/students/9/class",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    ), { id: "9" });

    expect((await module.studentClassRoutes.PUT!(request({ classId: 999 }))).status).toBe(404);
    expect((await module.studentClassRoutes.PUT!(request({ classId: 0 }))).status).toBe(400);
});

test("moving a student answers 404 for an unknown student", async () => {
    const { module } = await load([[]]);

    const response = await module.studentClassRoutes.PUT!(withParams(new Request(
        "https://example.com/api/admin/students/404/class",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId: 7 }) },
    ), { id: "404" }));

    expect(response.status).toBe(404);
});
