import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function createJsonRequest(url: string, method: string, body?: unknown) {
    return new Request(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}

async function loadTaskRoutes(options: {
    teacherId?: number;
    select?: unknown[];
} = {}) {
    const { db, operations } = createMockDb({
        select: options.select,
    });
    const notifications: Array<{ classIds: number[]; payload: Record<string, unknown> }> = [];

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
        requirePrimaryTeacher: async () => ({ teacherId: options.teacherId ?? 9, error: null }),
        notifyStudentsByClassIds: async (classIds: number[], payload: Record<string, unknown>) => {
            notifications.push({ classIds, payload });
        },
        getCurrentUser: async () => ({ id: options.teacherId ?? 9, type: "teacher" }),
        notifyStudentById: async () => undefined,
        isLockExpired: () => true,
        TEACHER_USER_TYPE: 2,
        ASSISTANT_USER_TYPE: 3,
    }));

    const module = await import("./topic-task");
    return { module, operations, notifications };
}

test("task publish validates that both topic and classes are selected", async () => {
    const { module, operations } = await loadTaskRoutes();
    const response = await module.taskRoutes.POST!(createJsonRequest(
        "https://example.com/api/teacher/tasks",
        "POST",
        { topicId: 12, classIds: [] }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "请选择课题和班级",
        },
    });
    expect(operations).toHaveLength(0);
});

test("task publish inserts new tasks and notifies only newly assigned classes", async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { module, operations, notifications } = await loadTaskRoutes({
        teacherId: 9,
        select: [
            [{
                id: 12,
                name: "抽样方法课题",
                status: 1,
                excelFilePath: "/storage/uploads/topic.xlsx",
                fieldMapping: { identifier: "id", stratified: ["gender"], numeric: ["score"] },
                weightConfig: { questionnaire: 30, process: 30, report: 40 },
            }],
            [{ id: 101 }, { id: 102 }],
            [],
        ],
    });

    const response = await module.taskRoutes.POST!(createJsonRequest(
        "https://example.com/api/teacher/tasks",
        "POST",
        { topicId: 12, classIds: [101, 102], deadline }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(201);
    expect(payload.success).toBe(true);
    expect(payload.data).toEqual({ success: true, skipped: [] });

    const taskInserts = operations.filter((operation) => operation.kind === "insert");
    expect(taskInserts).toHaveLength(1);
    expect(taskInserts[0]?.values).toEqual([
        expect.objectContaining({ classId: 101, topicId: 12 }),
        expect.objectContaining({ classId: 102, topicId: 12 }),
    ]);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
        classIds: [101, 102],
        payload: {
            type: "TASK_PUBLISHED",
            title: "新任务已发布",
            relatedType: "topic",
            relatedId: 12,
        },
    });
});

test("task publish rejects unpublished topics even when they belong to the teacher", async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { module, operations, notifications } = await loadTaskRoutes({
        teacherId: 9,
        select: [[{
            id: 12,
            name: "草稿课题",
            status: 0,
            excelFilePath: "/storage/uploads/topic.xlsx",
            fieldMapping: { identifier: "id", stratified: ["gender"], numeric: ["score"] },
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        }]],
    });

    const response = await module.taskRoutes.POST!(createJsonRequest(
        "https://example.com/api/teacher/tasks",
        "POST",
        { topicId: 12, classIds: [101], deadline }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "只能发布已发布课题",
        },
    });
    expect(operations.filter((operation) => operation.kind === "insert")).toHaveLength(0);
    expect(notifications).toHaveLength(0);
});

test("task publish rejects published topics with incomplete configuration", async () => {
    const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { module, operations, notifications } = await loadTaskRoutes({
        teacherId: 9,
        select: [[{
            id: 12,
            name: "缺配置课题",
            status: 1,
            excelFilePath: "/storage/uploads/topic.xlsx",
            fieldMapping: null,
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        }]],
    });

    const response = await module.taskRoutes.POST!(createJsonRequest(
        "https://example.com/api/teacher/tasks",
        "POST",
        { topicId: 12, classIds: [101], deadline }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "课题需先完成字段映射后才能发布",
        },
    });
    expect(operations.filter((operation) => operation.kind === "insert")).toHaveLength(0);
    expect(notifications).toHaveLength(0);
});

test("task extend clears old deadline reminders before notifying students about the new deadline", async () => {
    const originalDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const newDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { module, operations, notifications } = await loadTaskRoutes({
        teacherId: 9,
        select: [[{
            id: 88,
            classId: 101,
            deadline: originalDeadline,
        }]],
    });

    const request = createJsonRequest(
        "https://example.com/api/teacher/tasks/88/extend",
        "PUT",
        { deadline: newDeadline }
    ) as Request & { params?: Record<string, string> };
    request.params = { id: "88" };

    const response = await module.taskExtendRoutes.PUT!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ success: true });

    expect(operations.some((operation) => operation.kind === "transaction")).toBe(true);
    expect(operations.some((operation) => operation.kind === "update")).toBe(true);
    expect(operations.some((operation) => operation.kind === "delete")).toBe(true);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
        classIds: [101],
        payload: {
            type: "TASK_EXTENDED",
            title: "截止时间已延长",
            relatedType: "task",
            relatedId: 88,
        },
    });
});
