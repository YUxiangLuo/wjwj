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
    update?: unknown[];
} = {}) {
    mock.restore();
    const { db, operations } = createMockDb({
        select: options.select,
        update: options.update,
    });
    const notifications: Array<{ classIds: number[]; payload: Record<string, unknown> }> = [];
    const authMock = {
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
    };

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => authMock);
    mock.module("../routes/auth", () => authMock);
    mock.module(`${process.cwd()}/src/teacher/routes/auth.ts`, () => authMock);

    const module = await import("./topic-task");
    return { module, operations, notifications };
}

test("task list groups all joined non-aggregate fields for PostgreSQL", async () => {
    const { module, operations } = await loadTaskRoutes({
        select: [[{
            id: 88,
            topicId: 12,
            classId: 101,
            topic: "抽样方法课题",
            className: "统计学原理 A班",
            publishedAt: new Date("2026-03-01T00:00:00.000Z"),
            deadline: null,
            total: 10,
            completed: 4,
            pending: 2,
        }]],
    });

    const response = await module.taskRoutes.GET!(new Request("https://example.com/api/teacher/tasks"));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toHaveLength(1);

    const query = operations.find((operation) => operation.kind === "select");
    expect(query?.groupBy).toHaveLength(3);
});

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

test("task publish rejects timezone-less deadline strings before database work", async () => {
    const { module, operations } = await loadTaskRoutes();
    const response = await module.taskRoutes.POST!(createJsonRequest(
        "https://example.com/api/teacher/tasks",
        "POST",
        { topicId: 12, classIds: [101], deadline: "2999-03-23T14:30" }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "截止时间无效",
        },
    });
    expect(operations).toHaveLength(0);
});

test("task publish rejects impossible deadline dates before database work", async () => {
    const { module, operations } = await loadTaskRoutes();
    const response = await module.taskRoutes.POST!(createJsonRequest(
        "https://example.com/api/teacher/tasks",
        "POST",
        { topicId: 12, classIds: [101], deadline: "2999-02-30T14:30:00Z" }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "截止时间无效",
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

test("task extend rejects timezone-less deadline strings before database work", async () => {
    const { module, operations } = await loadTaskRoutes();
    const request = createJsonRequest(
        "https://example.com/api/teacher/tasks/88/extend",
        "PUT",
        { deadline: "2999-03-23T14:30" }
    ) as Request & { params?: Record<string, string> };
    request.params = { id: "88" };

    const response = await module.taskExtendRoutes.PUT!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "截止时间无效",
        },
    });
    expect(operations).toHaveLength(0);
});

test("task publish revives soft-deleted tasks instead of inserting duplicates", async () => {
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
            // rowsForTopic: class 101 has active task, class 102 has soft-deleted task
            [
                { id: 50, classId: 101, deletedAt: null },
                { id: 51, classId: 102, deletedAt: new Date("2026-03-20") },
            ],
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
    // class 101 should be skipped (active), class 102 should be revived (not inserted)
    expect(payload.data.skipped).toEqual([101]);

    const inserts = operations.filter((o) => o.kind === "insert");
    expect(inserts).toHaveLength(0);

    const updates = operations.filter((o) => o.kind === "update");
    expect(updates.length).toBeGreaterThanOrEqual(1);

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
        classIds: [102],
        payload: {
            type: "TASK_PUBLISHED",
            title: "新任务已发布",
            relatedType: "topic",
            relatedId: 12,
        },
    });
});

test("task delete soft-deletes when teacher owns the class", async () => {
    const { module, operations } = await loadTaskRoutes({
        teacherId: 9,
        select: [[{ id: 88 }]],
        update: [{ affectedRows: 1 }],
    });
    const request = createJsonRequest(
        "https://example.com/api/teacher/tasks/88",
        "DELETE"
    ) as Request & { params?: Record<string, string> };
    request.params = { id: "88" };

    const response = await module.taskItemRoutes.DELETE!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ success: true });
    expect(operations.some((o) => o.kind === "update")).toBe(true);
});

test("task delete returns 404 when task not found or not owned", async () => {
    const { module, operations } = await loadTaskRoutes({
        teacherId: 9,
        select: [[]],
    });
    const request = createJsonRequest(
        "https://example.com/api/teacher/tasks/999",
        "DELETE"
    ) as Request & { params?: Record<string, string> };
    request.params = { id: "999" };

    const response = await module.taskItemRoutes.DELETE!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(404);
    expect(payload.success).toBe(false);
    expect(operations.filter((o) => o.kind === "update")).toHaveLength(0);
});
