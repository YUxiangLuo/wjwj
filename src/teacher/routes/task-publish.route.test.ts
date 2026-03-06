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
        requirePrimaryTeacher: async () => ({ teacherId: options.teacherId ?? 9, error: null }),
        notifyStudentsByClassIds: async (classIds: number[], payload: Record<string, unknown>) => {
            notifications.push({ classIds, payload });
        },
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
            [{ id: 12 }],
            [{ id: 101 }, { id: 102 }],
            [],
            [{ name: "抽样方法课题" }],
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
    expect(taskInserts).toHaveLength(2);
    expect(taskInserts.map((operation) => (operation.values as any)?.classId)).toEqual([101, 102]);

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
