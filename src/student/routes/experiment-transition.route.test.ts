import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createMockDb } from "../../test-utils/mock-db";

function post(stage: number) {
    const request = new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stage === 2 ? {
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 5,
                designEffect: 1,
                nonResponseRate: 0,
                recommendedSize: 50,
                finalSampleSize: 50,
            },
        } : {}),
    });
    (request as Request & { params?: Record<string, string> }).params = { id: "3", stage: String(stage) };
    return request;
}

function experimentRecord(overrides: Record<string, unknown> = {}) {
    return {
        id: 9,
        studentId: 2,
        taskId: 3,
        version: 6,
        status: "in_progress",
        currentStage: 2,
        questionnaire: { title: "问卷" },
        samplePlan: null,
        samplingResults: null,
        reportContent: null,
        stage1CompletedAt: new Date("2026-01-01T00:00:00Z"),
        stage2CompletedAt: null,
        stage3CompletedAt: null,
        stage4CompletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

async function load(record: Record<string, unknown>) {
    const { db, operations } = createMockDb({ select: [[record]], update: [[]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        requireAuth: async () => ({ student: { id: 2, studentId: "S001", name: "学生一", classId: 7 }, error: null }),
    }));
    mock.module("../experiment/task-access", () => ({ getStudentTaskAccessError: async () => null }));
    mock.module("../experiment/task-info", () => ({
        findStudentTaskPopulationSize: async () => 200,
        findStudentTaskSamplingInfo: async () => null,
        findStudentTaskSchedule: async () => ({ openTime: null, deadline: new Date(Date.now() + 60_000) }),
        findStudentTaskSubmitInfo: async () => null,
        findStudentTaskTopicInfo: async () => ({ id: 3, topicId: 4 }),
    }));
    return { module: await import(`./experiment.ts?transition=${crypto.randomUUID()}`), operations };
}

test("stage completion returns 409 when the observed experiment version is stale", async () => {
    const { module, operations } = await load(experimentRecord());
    const response = await module.stageCompleteRoutes.POST!(post(2));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    const condition = new PgDialect().sqlToQuery(operations.find((item) => item.kind === "update")!.where as SQL);
    expect(condition.params).toEqual([9, 6, "in_progress", 2]);
});

test("stage reopen returns 409 when the observed experiment version is stale", async () => {
    const { module, operations } = await load(experimentRecord({
        currentStage: 4,
        stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
        stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
        stage4CompletedAt: new Date("2026-01-04T00:00:00Z"),
    }));
    const response = await module.stageReopenRoutes.POST!(post(2));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    const condition = new PgDialect().sqlToQuery(operations.find((item) => item.kind === "update")!.where as SQL);
    expect(condition.params).toEqual([9, 6, "in_progress", 4]);
});
