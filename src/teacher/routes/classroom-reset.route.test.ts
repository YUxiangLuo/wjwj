import { expect, mock, test } from "bun:test";
import { assistant, student } from "../../db/schema";
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
