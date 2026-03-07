import { expect, mock, test } from "bun:test";
import { assistant, assistantClass } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadClassroomRoutes(options: {
    teacherId?: number;
    select?: unknown[];
    update?: unknown[];
    delete?: unknown[];
} = {}) {
    const { db, operations } = createMockDb({
        select: options.select,
        update: options.update,
        delete: options.delete,
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

test("assistant list hides deleted assistants", async () => {
    const { module } = await loadClassroomRoutes({
        select: [
            [
                { id: 1, account: "assistant", name: "演示助教", status: 1 },
                { id: 2, account: "A002", name: "助教小陈(已删除)", status: 0 },
            ],
            [{ name: "统计学原理 A班", id: 1 }],
            [{ lastLogin: "2026-03-07 13:00:00" }],
        ],
    });

    const response = await module.assistantRoutes.GET!(new Request("https://example.com/api/teacher/assistants"));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
        success: true,
        data: [{
            id: 1,
            name: "演示助教",
            studentId: "assistant",
            email: "",
            assignedClasses: ["统计学原理 A班"],
            assignedClassIds: [1],
            status: 1,
            lastLogin: "2026-03-07 13:00:00",
        }],
    });
});

test("assistant delete removes class bindings and hides the assistant", async () => {
    const { module, operations } = await loadClassroomRoutes({
        select: [[{ id: 2, name: "助教小陈" }]],
    });

    const response = await module.assistantItemRoutes.DELETE!(
        withRouteParam(new Request("https://example.com/api/teacher/assistants/2", { method: "DELETE" }), "2")
    );
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, data: { success: true } });

    const deleteOperation = operations.find((operation) => operation.kind === "delete" && operation.table === assistantClass);
    const updateOperation = operations.find((operation) => operation.kind === "update" && operation.table === assistant);

    expect(deleteOperation).toBeDefined();
    expect(updateOperation?.set).toMatchObject({
        status: 0,
        name: "助教小陈(已删除)",
    });
});
