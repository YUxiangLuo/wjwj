import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadTaskRoutes(selectQueue: unknown[]) {
    const { db } = createMockDb({ select: selectQueue });

    mock.restore();
    mock.module("../../db", () => ({ db }));
    mock.module("../../server/system-config", () => ({
        getConfigNumber: async () => 30,
    }));
    mock.module("./auth", () => ({
        requireAuth: async () => ({
            student: {
                id: 11,
                classId: 7,
                name: "Alice",
                studentId: "20230001",
                status: 1,
                isFirstLogin: 0,
            },
            error: null,
            sessionExpiresAt: null,
        }),
    }));

    return import(`./tasks?student-tasks-route-test=${Math.random()}`);
}

test("tasks route hides stale reject reason after experiment restarts", async () => {
    const module = await loadTaskRoutes([
        [{
            id: 1,
            topicId: 2,
            classId: 7,
            openTime: new Date("2026-03-01T00:00:00.000Z"),
            deadline: new Date("2026-04-01T00:00:00.000Z"),
            createdAt: new Date("2026-02-20T00:00:00.000Z"),
            topicName: "消费者行为分析实验",
            topicDescription: "desc",
        }],
        [{
            id: 501,
            taskId: 1,
            currentStage: 1,
            status: 0,
            lastSavedAt: new Date("2026-03-08T08:00:00.000Z"),
        }],
        [{
            experimentId: 501,
            totalScore: null,
            rejectReason: "报告部分内容不完整，请补充数据分析章节后重新提交。",
            status: 3,
            lockedById: null,
            lockedAt: null,
        }],
    ]);

    const response = await module.tasksRoutes.GET!(new Request("https://example.com/api/student/tasks", { method: "GET" }));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data[0]).toMatchObject({
        id: 1,
        status: "in_progress",
        currentStage: 1,
        progress: 25,
    });
    expect(payload.data[0].rejectReason).toBeUndefined();
});

test("task detail route hides stale reject reason after experiment restarts", async () => {
    const module = await loadTaskRoutes([
        [{
            id: 1,
            topicId: 2,
            classId: 7,
            openTime: new Date("2026-03-01T00:00:00.000Z"),
            deadline: new Date("2026-04-01T00:00:00.000Z"),
            createdAt: new Date("2026-02-20T00:00:00.000Z"),
            topicName: "消费者行为分析实验",
            topicDescription: "desc",
            excelRowCount: 10000,
            topicRecommendQuestions: null,
        }],
        [],
        [{
            id: 501,
            studentId: 11,
            taskId: 1,
            currentStage: 1,
            status: 0,
        }],
        [{
            id: 801,
            experimentId: 501,
            totalScore: null,
            rejectReason: "报告部分内容不完整，请补充数据分析章节后重新提交。",
            status: 3,
            submittedAt: new Date("2026-03-07T08:00:00.000Z"),
            lockedById: null,
            lockedAt: null,
        }],
    ]);

    const response = await module.taskDetailRoutes.GET!(withRouteParam(
        new Request("https://example.com/api/student/tasks/1", { method: "GET" }),
        "1"
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
        id: 1,
        status: "in_progress",
        currentStage: 1,
    });
    expect(payload.data.rejectReason).toBeUndefined();
});
