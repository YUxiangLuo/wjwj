import { expect, mock, test } from "bun:test";
import { assistant, class_, semester, student } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

function withParams(request: Request, params: Record<string, string>) {
    (request as Request & { params?: Record<string, string> }).params = params;
    return request;
}

async function loadClassroomRoutes(options: {
    teacherId?: number;
    select?: unknown[];
    update?: unknown[];
} = {}) {
    const { db, operations } = createMockDb({
        select: options.select,
        update: options.update,
    });

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
        requirePrimaryTeacher: async () => ({ teacherId: options.teacherId ?? 9, error: null }),
        withTeacherAuth: (handler: unknown) => handler,
        withPrimaryTeacherAuth: (handler: unknown) => handler,
        getCurrentUser: async () => ({ id: options.teacherId ?? 9, type: "teacher" }),
        notifyStudentById: async () => undefined,
        isLockExpired: () => true,
        TEACHER_USER_TYPE: 2,
        ASSISTANT_USER_TYPE: 3,
    }));

    const module = await import("./classroom");
    return { module, operations };
}

test("class list groups joined semester field for PostgreSQL", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [[{
            id: 3,
            name: "统计学原理 A班",
            semester: "2026 春季",
            studentCount: 12,
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
        }]],
    });

    const response = await module.classRoutes.GET!(new Request("https://example.com/api/teacher/classes"));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(1);

    const query = operations.find((operation) => operation.kind === "select");
    expect(query?.groupBy).toEqual([class_.id, semester.id]);
});

test("student password reset also clears lock state", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [[{ id: 12, studentId: "2024002" }]],
    });

    const response = await module.studentRoutes.PUT!(
        withParams(
            new Request("https://example.com/api/teacher/students/12", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "reset_password" }),
            }),
            { id: "12" }
        )
    );

    expect(response.status).toBe(200);

    const updateOperation = operations.find((operation) => operation.kind === "update" && operation.table === student);
    expect(updateOperation?.set).toMatchObject({
        isFirstLogin: 1,
        loginFailCount: 0,
        lockedUntil: null,
    });
});

test("assistant password reset also clears lock state", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [[{ id: 7, account: "A002", name: "助教小陈", status: 1 }]],
    });

    const response = await module.assistantItemRoutes.PUT!(
        withParams(
            new Request("https://example.com/api/teacher/assistants/7", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "reset_password" }),
            }),
            { id: "7" }
        )
    );

    expect(response.status).toBe(200);

    const updateOperation = operations.find((operation) => operation.kind === "update" && operation.table === assistant);
    expect(updateOperation?.set).toMatchObject({
        isFirstLogin: 1,
        loginFailCount: 0,
        lockedUntil: null,
    });
});
