import { expect, mock, test } from "bun:test";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withTaskId(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadTaskRoutes(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./topic-task.ts?task-progress=${crypto.randomUUID()}`);
    return { module, operations };
}

test("task progress rejects a malformed id before querying", async () => {
    const { module, operations } = await loadTaskRoutes([]);

    const response = await module.taskProgressRoutes.GET!(withTaskId(new Request("https://example.com/api/teacher/tasks/abc/progress"), "abc"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_ID" } });
    expect(operations).toHaveLength(0);
});

test("task progress returns 404 for a task outside the teacher's classes", async () => {
    const { module } = await loadTaskRoutes([[]]);

    const response = await module.taskProgressRoutes.GET!(withTaskId(new Request("https://example.com/api/teacher/tasks/7/progress"), "7"));

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
});

test("task progress returns the task summary and bucketed students", async () => {
    const taskRow = { id: 7, topicName: "咖啡馆", className: "统计一班", classId: 3, deadline: null };
    const students = [
        { studentId: "S001", name: "甲", experimentId: 11, currentStage: 4, experimentStatus: "submitted", lastActivity: null },
    ];
    const { module } = await loadTaskRoutes([[taskRow], students]);

    const response = await module.taskProgressRoutes.GET!(withTaskId(new Request("https://example.com/api/teacher/tasks/7/progress"), "7"));
    const payload = await response.json() as { success: boolean; data: { counts: Record<string, number>; students: unknown[] } };

    expect(response.status).toBe(200);
    expect(payload.data.counts).toMatchObject({ submitted: 1 });
    expect(payload.data.students).toHaveLength(1);
});
