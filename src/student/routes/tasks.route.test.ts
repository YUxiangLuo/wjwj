import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function withId(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function load(select: unknown[]) {
    const { db } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({ requireAuth: async () => ({ student: { id: 11, classId: 7 }, error: null }) }));
    return import(`./tasks.ts?tasks=${crypto.randomUUID()}`);
}

test("task list derives progress from the single experiment record", async () => {
    const module = await load([
        [{ id: 1, topicId: 2, openTime: new Date("2026-03-01T00:00:00Z"), deadline: null, createdAt: new Date(), name: "抽样实验", description: "desc" }],
        [{ id: 501, taskId: 1, currentStage: 2, status: "in_progress", stage4CompletedAt: null, totalScore: null, rejectReason: null }],
    ]);
    const payload = await (await module.tasksRoutes.GET!(new Request("https://example.com"))).json() as any;
    expect(payload.data[0]).toMatchObject({ id: 1, status: "in_progress", currentStage: 2, progress: 25 });
    expect(payload.data[0].rejectReason).toBeUndefined();
});

test("rejected work is not reported as completed", async () => {
    const module = await load([
        [{ id: 1, topicId: 2, openTime: null, deadline: null, createdAt: new Date(), name: "抽样实验", description: "desc" }],
        [{ id: 501, taskId: 1, currentStage: 4, status: "rejected", stage4CompletedAt: new Date(), totalScore: null, rejectReason: "请修改" }],
    ]);
    const payload = await (await module.tasksRoutes.GET!(new Request("https://example.com"))).json() as any;
    expect(payload.data[0]).toMatchObject({ status: "rejected", progress: 75 });
});

test("task detail exposes the current rejected reason without submission history", async () => {
    const module = await load([
        [{ id: 1, topicId: 2, openTime: null, deadline: null, createdAt: new Date(), name: "抽样实验", description: "desc", populationSize: 100, recommendQuestions: null }],
        [],
        [{ status: "rejected", currentStage: 4, totalScore: null, rejectReason: "请补充报告" }],
    ]);
    const response = await module.taskDetailRoutes.GET!(withId(new Request("https://example.com/api/student/tasks/1"), "1"));
    const payload = await response.json() as any;
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ id: 1, status: "rejected", currentStage: 4, rejectReason: "请补充报告" });
});
