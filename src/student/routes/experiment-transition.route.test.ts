import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createStudentAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function post(stage: number, observedVersion: unknown = 6) {
    const request = new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stage === 2 ? {
            observedVersion,
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 5,
                designEffect: 1,
                nonResponseRate: 0,
                recommendedSize: 132,
                finalSampleSize: 50,
            },
        } : { observedVersion }),
    });
    (request as Request & { params?: Record<string, string> }).params = { id: "3", stage: String(stage) };
    return request;
}

function postSubmit(observedVersion: unknown) {
    const request = new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion }),
    });
    (request as Request & { params?: Record<string, string> }).params = { id: "3" };
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

async function load(record: Record<string, unknown>, options: {
    update?: unknown[];
    submitInfo?: Record<string, unknown> | null;
} = {}) {
    const { db, operations } = createMockDb({ select: [[record]], update: options.update ?? [[]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock({
        requireAuth: async () => ({ student: { id: 2, studentId: "S001", name: "学生一", classId: 7 }, error: null }),
    }));
    mock.module("../experiment/task-access", () => ({
        getStudentTaskAccessError: async () => null,
        getStudentTopicAttachmentAccessError: async () => null,
    }));
    mock.module("../experiment/task-info", () => ({
        findStudentTaskPopulationSize: async () => 200,
        findStudentTaskSamplingInfo: async () => null,
        findStudentTaskSchedule: async () => ({ openTime: null, deadline: new Date(Date.now() + 60_000) }),
        findStudentTaskSubmitInfo: async () => options.submitInfo ?? null,
        findStudentTaskTopicInfo: async () => ({ id: 3, topicId: 4 }),
    }));
    return { module: await import(`./experiment.ts?transition=${crypto.randomUUID()}`), operations };
}

test("stage completion returns 409 when a concurrent update wins after the route read", async () => {
    const { module, operations } = await load(experimentRecord());
    const response = await module.stageCompleteRoutes.POST!(post(2));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    const condition = new PgDialect().sqlToQuery(operations.find((item) => item.kind === "update")!.where as SQL);
    expect(condition.params).toEqual([9, 6, "in_progress", 2]);
});

test("stage reopen returns 409 when a concurrent update wins after the route read", async () => {
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

test("stage completion rejects a stale tab before attempting an update", async () => {
    const { module, operations } = await load(experimentRecord());
    const response = await module.stageCompleteRoutes.POST!(post(2, 5));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    expect(operations.filter((item) => item.kind === "update")).toHaveLength(0);
});

test("stage transitions require a valid observedVersion", async () => {
    const { module, operations } = await load(experimentRecord());
    const response = await module.stageCompleteRoutes.POST!(post(2, "6"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(operations.filter((item) => item.kind === "update")).toHaveLength(0);
});

test("an already-submitted retry succeeds after the deadline without another write", async () => {
    const { module, operations } = await load(experimentRecord({
        version: 7,
        status: "submitted",
        currentStage: 4,
        submittedAt: new Date("2026-01-01T00:00:00Z"),
    }), {
        submitInfo: {
            openTime: new Date("2025-01-01T00:00:00Z"),
            deadline: new Date("2025-01-02T00:00:00Z"),
        },
    });
    const response = await module.submitRoutes.POST!(postSubmit(6));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { success: true, experimentId: 9 } });
    expect(operations.filter((item) => item.kind === "update")).toHaveLength(0);
});

test("submission forwards the task sampling policy into the immutable snapshot", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const policy = {
        version: 1,
        methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" },
    } as const;
    const questionnaire = {
        title: "教学问卷",
        welcomeText: "<p>欢迎参加本次抽样调查，请根据实际情况认真填写。</p>",
        endingText: "<p>感谢完成本次抽样调查，您的回答仅用于课堂教学。</p>",
        questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, type: "boolean", content: `这是第${index + 1}个调查问题吗？` })),
    };
    const complete = experimentRecord({
        currentStage: 4,
        questionnaire,
        samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 50 },
        samplingResults: {
            simple: { completed: true, sampleCount: 50 },
            systematic: { completed: true, sampleCount: 50, interval: 4 },
        },
        reportContent: `<p>${"这是用于课堂教学的完整分析报告内容。".repeat(12)}</p>`,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
    });
    const { module, operations } = await load(complete, {
        update: [[{ id: 9 }]],
        submitInfo: {
            openTime: null,
            deadline: new Date(Date.now() + 60_000),
            topicName: "自定义策略实验",
            populationSize: 200,
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
            fieldMapping: null,
            samplingPolicy: policy,
        },
    });

    const response = await module.submitRoutes.POST!(postSubmit(6));
    expect(response.status).toBe(200);
    const update = operations.find((item) => item.kind === "update");
    expect((update?.set as any)?.submissionSnapshot?.samplingPolicy).toEqual(policy);
});
