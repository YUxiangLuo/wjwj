import { expect, mock, spyOn, test } from "bun:test";
import type { PopulationStats } from "../experiment/population-stats-job";
import { PPS_UNAVAILABLE_REASON } from "../experiment/sampling-messages";
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
        samplingGeneration: 0,
        analysisReferences: [],
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
    samplingInfo?: Record<string, unknown>;
    schedule?: { openTime: Date | null; deadline: Date | null };
    readStats?: () => Promise<PopulationStats>;
} = {}) {
    const { db, operations } = createMockDb({ select: [[record]], update: options.update ?? [[]] });
    const readStats = mock(options.readStats ?? (async () => {
        throw new Error("Unexpected population statistics work");
    }));
    mock.module("../experiment/population-stats-service", () => ({
        populationStatsService: { run: readStats },
        populationRevisionKey: () => "test-revision",
    }));
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
        findStudentTaskSamplingInfo: async () => options.samplingInfo ?? null,
        findStudentTaskSchedule: async () => options.schedule ?? { openTime: null, deadline: new Date(Date.now() + 60_000) },
        findStudentTaskSubmitInfo: async () => options.submitInfo ?? null,
        findStudentTaskTopicInfo: async () => ({ id: 3, topicId: 4 }),
    }));
    return { module: await import(`./experiment.ts?transition=${crypto.randomUUID()}`), operations, readStats };
}

function statsCompletionFixture(stage: 2 | 3) {
    const stored = {
        simple: { completed: true, serverGenerated: true, sampleCount: 50, data: Array.from({ length: 50 }, (_, id) => ({ id })) },
        systematic: { completed: true, serverGenerated: true, sampleCount: 50, interval: 4, data: Array.from({ length: 50 }, (_, id) => ({ id: id * 4 })) },
    };
    const record = experimentRecord({
        currentStage: stage,
        ...(stage === 3 ? {
            stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
            samplePlan: { confidenceLevel: "95", marginOfError: 5, finalSampleSize: 50 },
            samplingResults: stored,
        } : {}),
    });
    const marked = {
        ...record,
        samplingResults: { ...stored, pps: { unavailable: true, unavailableReason: PPS_UNAVAILABLE_REASON, serverGenerated: true } },
    };
    const updated = { ...(stage === 3 ? marked : record), currentStage: stage + 1, version: 7 };
    const stats: PopulationStats = {
        stats: { group: { A: 100, B: 100 } }, numericFields: [], categoricalFields: ["group"],
        categoricalStats: { group: { A: 100, B: 100 } }, populationNumericStats: {},
        ppsEligibleFields: [], stratumNumericStats: {},
    };
    return {
        record, stats,
        options: {
            update: stage === 3 ? [[marked], [updated]] : [[updated]],
            samplingInfo: {
                excelFilePath: "/storage/stage-window.csv", fieldMapping: { stratified: ["group"] },
                samplingPolicy: { version: 1, methods: {
                    simple: "required", systematic: "optional",
                    pps: stage === 3 ? "optional" : "disabled",
                    stratified: stage === 2 ? "required" : "disabled",
                } },
            },
        },
    };
}

for (const stage of [2, 3] as const) {
    test(`stage ${stage} admitted before the deadline completes after statistics queueing crosses it`, async () => {
        const now = Date.now();
        const deadline = new Date(now + 1_000);
        const clock = spyOn(Date, "now").mockReturnValue(now);
        const entered = Promise.withResolvers<void>();
        const release = Promise.withResolvers<void>();
        try {
            const fixture = statsCompletionFixture(stage);
            const { module, operations, readStats } = await load(fixture.record, {
                ...fixture.options,
                schedule: { openTime: null, deadline },
                readStats: async () => { entered.resolve(); await release.promise; return fixture.stats; },
            });
            const pending = module.stageCompleteRoutes.POST!(post(stage));
            await entered.promise;
            expect(readStats).toHaveBeenCalledTimes(1);
            expect(operations.some(op => op.kind === "update")).toBe(false);
            // Queue delay stays well inside the worker's 30-second deadline.
            clock.mockReturnValue(deadline.getTime() + 1);
            release.resolve();
            const response = await pending;
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ data: { currentStage: stage + 1, version: 7 } });
            expect(operations.filter(op => op.kind === "update")).toHaveLength(stage === 3 ? 2 : 1);
        } finally { release.resolve(); clock.mockRestore(); }
    });

    test(`stage ${stage} already past the deadline rejects before statistics work or PPS marker writes`, async () => {
        const fixture = statsCompletionFixture(stage);
        const { module, operations, readStats } = await load(fixture.record, {
            ...fixture.options,
            schedule: { openTime: null, deadline: new Date(Date.now() - 1_000) },
            readStats: async () => fixture.stats,
        });
        const response = await module.stageCompleteRoutes.POST!(post(stage));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "TASK_DEADLINE" } });
        expect(readStats).not.toHaveBeenCalled();
        expect(operations.some(op => op.kind === "update" || op.kind === "insert")).toBe(false);
    });
}

for (const feasible of [false, true]) {
    test(`required PPS planning feasibility ${feasible} gates stage 2 without marking sampling complete`, async () => {
        const fixture = statsCompletionFixture(2);
        fixture.options.samplingInfo.samplingPolicy.methods.stratified = "disabled";
        fixture.options.samplingInfo.samplingPolicy.methods.pps = "required";
        const { module, operations, readStats } = await load(fixture.record, {
            ...fixture.options, readStats: async () => ({ ...fixture.stats, ppsPlanFeasible: feasible }),
        });
        const response = await module.stageCompleteRoutes.POST!(post(2));
        expect(readStats).toHaveBeenCalledWith(expect.objectContaining({ ppsSampleSize: 50 }), expect.any(AbortSignal));
        expect(response.status).toBe(feasible ? 200 : 400);
        if (!feasible) {
            expect(await response.json()).toMatchObject({ error: { code: "PPS_PLAN_INFEASIBLE", message: expect.stringContaining("普查") } });
            expect(operations.some(op => op.kind === "update")).toBe(false);
        } else {
            expect(operations.filter(op => op.kind === "update")).toHaveLength(1);
            expect(operations.find(op => op.kind === "update")?.set).not.toHaveProperty("samplingResults");
        }
    });
}

test("invalid planning inputs reject before required PPS worker work", async () => {
    const fixture = statsCompletionFixture(2);
    fixture.options.samplingInfo.samplingPolicy.methods.stratified = "disabled";
    fixture.options.samplingInfo.samplingPolicy.methods.pps = "required";
    const { module, readStats } = await load(fixture.record, fixture.options);
    const request = post(2);
    const invalid = new Request(request, { body: JSON.stringify({ observedVersion: 6, samplePlan: { finalSampleSize: 1e308 } }) });
    (invalid as Request & { params: Record<string, string> }).params = { id: "3", stage: "2" };
    expect((await module.stageCompleteRoutes.POST!(invalid)).status).toBe(400);
    expect(readStats).not.toHaveBeenCalled();
});

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
        samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 50, finalSampleSizeSource: "manual" },
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

test("a required PPS whose size field is unusable completes stage 3 instead of trapping the student", async () => {
    // Regression: a template published with pps=required over a population with no
    // eligible size field used to answer SAMPLING_RESULTS_REQUIRED forever.
    const stored = {
        simple: { completed: true, serverGenerated: true, sampleCount: 50, data: Array.from({ length: 50 }, (_, id) => ({ id })) },
        systematic: { completed: true, serverGenerated: true, sampleCount: 50, interval: 4, data: Array.from({ length: 50 }, (_, id) => ({ id: id * 4 })) },
        pps: { unavailable: true, unavailableReason: PPS_UNAVAILABLE_REASON, serverGenerated: true },
    };
    const record = experimentRecord({
        currentStage: 3,
        stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
        samplePlan: { confidenceLevel: "95", marginOfError: 5, finalSampleSize: 50 },
        samplingResults: stored,
    });
    const updated = { ...record, currentStage: 4, version: 7 };
    const stats: PopulationStats = {
        stats: { group: { A: 100, B: 100 } }, numericFields: [], categoricalFields: ["group"],
        categoricalStats: { group: { A: 100, B: 100 } }, populationNumericStats: {},
        ppsEligibleFields: [], stratumNumericStats: {},
    };
    const { db } = createMockDb({ select: [[record]], update: [[updated]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock());
    mock.module("../experiment/population-stats-service", () => ({
        populationStatsService: { run: async () => stats },
        populationRevisionKey: () => "revision",
    }));
    const module = await import(`./experiment.ts?pps-required-unavailable=${crypto.randomUUID()}`);

    const response = await module.stageCompleteRoutes.POST!(post(3));

    expect(response.status).toBe(200);
});
