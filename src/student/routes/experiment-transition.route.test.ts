import { expect, mock, spyOn, test } from "bun:test";
import type { PopulationStats } from "../experiment/population-stats-job";
import { PPS_UNAVAILABLE_REASON } from "../experiment/sampling-messages";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { calculateMeanEstimationSampleSize } from "../experiment/sample-plan";
import { createStudentAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function validQuestionnaire() {
    return {
        title: "教学问卷",
        welcomeText: "<p>欢迎参加本次抽样调查，请根据实际情况认真填写。</p>",
        endingText: "<p>感谢完成本次抽样调查，您的回答仅用于课堂教学。</p>",
        questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, type: "boolean", content: `这是第${index + 1}个调查问题吗？` })),
    };
}

function fieldworkFor(methods: string[]) {
    return {
        methods: Object.fromEntries(methods.map((method) => [
            method,
            {
                method,
                dispatchSeed: 2026,
                dispatchedAt: "2026-01-02T00:00:00Z",
                invitedCount: 50,
                records: [
                    {
                        unitIndex: 0,
                        stratum: "A",
                        status: "completed_clean",
                        durationSeconds: 95,
                        answeredCount: 5,
                        totalQuestions: 5,
                        straightliner: false,
                        observedValues: {},
                    },
                ],
            },
        ])),
    };
}

function post(stage: number, observedVersion: unknown = 6, extraBody?: Record<string, unknown>) {
    const request = new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extraBody ? { observedVersion, ...extraBody } : stage === 2 ? {
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
    const q = validQuestionnaire();
    return {
        id: 9,
        studentId: 2,
        taskId: 3,
        version: 6,
        samplingGeneration: 0,
        analysisReferences: [],
        status: "in_progress",
        currentStage: 2,
        activeWaveNumber: 1,
        questionnaire: q,
        samplePlan: null,
        samplingResults: { simple: { completed: true, sampleCount: 50, serverGenerated: true } },
        adjustmentPlan: null,
        wavesData: [
            {
                waveNumber: 1,
                kind: "pilot",
                label: "Wave 1",
                questionnaire: q,
                samplePlan: null,
                samplingResults: { simple: { completed: true, sampleCount: 50, serverGenerated: true } },
                fieldwork: fieldworkFor(["simple"]),
                cleaningConfig: { excludeSpeeders: true, excludeStraightliners: true },
                completedAt: null,
            },
        ],
        reportContent: null,
        stage1CompletedAt: new Date("2026-01-01T00:00:00Z"),
        stage2CompletedAt: null,
        stage3CompletedAt: null,
        stage4CompletedAt: null,
        stage5CompletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

async function load(record: Record<string, unknown>, options: {
    select?: unknown[];
    update?: unknown[];
    submitInfo?: Record<string, unknown> | null;
    samplingInfo?: Record<string, unknown>;
    schedule?: { openTime: Date | null; deadline: Date | null };
    readStats?: () => Promise<PopulationStats>;
} = {}) {
    const { db, operations } = createMockDb({ select: options.select ?? [[record]], update: options.update ?? [[]] });
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

function statsCompletionFixture(stage: 2 | 4) {
    const q = validQuestionnaire();
    const stored = {
        simple: { completed: true, serverGenerated: true, sampleCount: 50, data: Array.from({ length: 50 }, (_, id) => ({ id })) },
        systematic: { completed: true, serverGenerated: true, sampleCount: 50, interval: 4, data: Array.from({ length: 50 }, (_, id) => ({ id: id * 4 })) },
    };
    const plan = { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 50 };
    const ppsUnavailable = { unavailable: true, unavailableReason: PPS_UNAVAILABLE_REASON, serverGenerated: true };
    const wave2 = (sr: Record<string, unknown>) => ({
        waveNumber: 2,
        kind: "main",
        label: "Wave 2",
        questionnaire: q,
        samplePlan: plan,
        samplingResults: sr,
        fieldwork: fieldworkFor(["simple", "systematic"]),
        cleaningConfig: { excludeSpeeders: true, excludeStraightliners: true },
        completedAt: null,
    });
    const record = experimentRecord({
        currentStage: stage,
        ...(stage === 4 ? {
            activeWaveNumber: 2,
            stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
            stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
            samplePlan: plan,
            samplingResults: stored,
            wavesData: [wave2(stored)],
        } : {}),
    });
    const marked = {
        ...record,
        samplingResults: { ...stored, pps: ppsUnavailable },
        wavesData: [wave2({ ...stored, pps: ppsUnavailable })],
    };
    const updated = { ...(stage === 4 ? marked : record), wavesData: [], samplingResults: null, currentStage: stage + 1, version: 7 };
    const trueVariance = 35 * 199 / 200;
    const meanPlan = {
        estimationType: "mean",
        confidenceLevel: "95",
        marginOfError: 1,
        populationVariance: trueVariance,
        designEffect: 1,
        nonResponseRate: 0,
        recommendedSize: calculateMeanEstimationSampleSize({
            confidenceLevel: "95",
            marginOfError: 1,
            populationSize: 200,
            populationVariance: trueVariance,
            designEffect: 1,
            nonResponseRate: 0,
        }),
        finalSampleSize: 50,
    };
    const stats: PopulationStats = {
        stats: { group: { A: 100, B: 100 } }, numericFields: ["value"], categoricalFields: ["group"],
        categoricalStats: { group: { A: 100, B: 100 } },
        populationNumericStats: { value: { mean: 10, variance: 35, stdDev: Math.sqrt(35), count: 200 } },
        ppsEligibleFields: [], stratumNumericStats: {},
    };
    return {
        record, stats, meanPlan,
        options: {
            update: stage === 4 ? [[marked], [updated]] : [[updated]],
            samplingInfo: {
                excelFilePath: "/storage/stage-window.csv",
                fieldMapping: stage === 2
                    ? { numeric: ["value"], analysisTarget: { kind: "mean", field: "value" } }
                    : { stratified: ["group"] },
                samplingPolicy: { version: 1, methods: {
                    simple: "required", systematic: "optional",
                    pps: stage === 4 ? "optional" : "disabled",
                    stratified: "disabled",
                } },
            },
        },
    };
}

for (const stage of [2, 4] as const) {
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
            const pending = module.stageCompleteRoutes.POST!(
                stage === 2 ? post(2, 6, { samplePlan: fixture.meanPlan }) : post(4),
            );
            await entered.promise;
            expect(readStats).toHaveBeenCalledTimes(1);
            expect(operations.some(op => op.kind === "update")).toBe(false);
            // Queue delay stays well inside the worker's 30-second deadline.
            clock.mockReturnValue(deadline.getTime() + 1);
            release.resolve();
            const response = await pending;
            expect(response.status).toBe(200);
            expect(await response.json()).toMatchObject({ data: { currentStage: stage + 1, version: 7 } });
            expect(operations.filter(op => op.kind === "update")).toHaveLength(stage === 4 ? 2 : 1);
        } finally { release.resolve(); clock.mockRestore(); }
    });

    test(`stage ${stage} already past the deadline rejects before statistics work or PPS marker writes`, async () => {
        const fixture = statsCompletionFixture(stage);
        const { module, operations, readStats } = await load(fixture.record, {
            ...fixture.options,
            schedule: { openTime: null, deadline: new Date(Date.now() - 1_000) },
            readStats: async () => fixture.stats,
        });
        const response = await module.stageCompleteRoutes.POST!(
            stage === 2 ? post(2, 6, { samplePlan: fixture.meanPlan }) : post(4),
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "TASK_DEADLINE" } });
        expect(readStats).not.toHaveBeenCalled();
        expect(operations.some(op => op.kind === "update" || op.kind === "insert")).toBe(false);
    });
}

for (const feasible of [false, true]) {
    test(`required PPS planning feasibility ${feasible} gates stage 4 wave-plan without marking sampling complete`, async () => {
        const fixture = statsCompletionFixture(4);
        fixture.options.samplingInfo.samplingPolicy.methods.stratified = "disabled";
        fixture.options.samplingInfo.samplingPolicy.methods.pps = "required";
        const updatedPlanRow = { ...fixture.record, wavesData: [], samplingResults: null, version: 7 };
        const { module, operations, readStats } = await load(fixture.record, {
            ...fixture.options,
            update: [[updatedPlanRow]],
            readStats: async () => ({ ...fixture.stats, ppsPlanFeasible: feasible }),
        });
        const planReq = new Request("https://example.com/api/student/tasks/3/experiment/wave-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                observedVersion: 6,
                samplePlan: {
                    confidenceLevel: "95",
                    marginOfError: 5,
                    designEffect: 1,
                    nonResponseRate: 0,
                    recommendedSize: 132,
                    finalSampleSize: 50,
                },
            }),
        });
        (planReq as Request & { params?: Record<string, string> }).params = { id: "3" };
        const response = await module.wavePlanRoutes.POST!(planReq);
        expect(readStats).toHaveBeenCalledWith(expect.objectContaining({ ppsSampleSize: 50 }), expect.any(AbortSignal));
        expect(response.status).toBe(feasible ? 200 : 400);
        if (!feasible) {
            expect(await response.json()).toMatchObject({ error: { code: "PPS_PLAN_INFEASIBLE" } });
            expect(operations.some(op => op.kind === "update")).toBe(false);
        } else {
            expect(operations.filter(op => op.kind === "update")).toHaveLength(1);
            expect(operations.find(op => op.kind === "update")?.set).not.toHaveProperty("samplingResults");
        }
    });
}

test("mean planning variance is rechecked against the current population", async () => {
    const fixture = statsCompletionFixture(2);
    const stats = { ...fixture.stats, populationNumericStats: { value: { mean: 10, variance: 35, stdDev: Math.sqrt(35), count: 200 } } };
    const { module, operations, readStats } = await load(fixture.record, { ...fixture.options, select: [[fixture.record], [fixture.record]], readStats: async () => stats });
    const planFor = (variance: number) => ({
        estimationType: "mean", confidenceLevel: "95", marginOfError: 1, populationVariance: variance,
        designEffect: 1, nonResponseRate: 0,
        recommendedSize: calculateMeanEstimationSampleSize({ confidenceLevel: "95", marginOfError: 1, populationSize: 200, populationVariance: variance, designEffect: 1, nonResponseRate: 0 }),
        finalSampleSize: 1,
    });
    const postPlan = (variance: number) => post(2, 6, { samplePlan: planFor(variance) });
    // 自洽的伪造方差（真实 35）必须在写入前拒绝
    const forged = await module.stageCompleteRoutes.POST!(postPlan(1e-6));
    expect(forged.status).toBe(400);
    expect(await forged.json()).toMatchObject({ error: { message: expect.stringContaining("总体方差与当前总体不一致") } });
    expect(operations.filter(op => op.kind === "update")).toHaveLength(0);
    expect(readStats).toHaveBeenCalled();
    // 与总体一致的 σ²（S²=35、N=200 → 34.825）通过
    const accepted = await module.stageCompleteRoutes.POST!(postPlan(35 * 199 / 200));
    expect(accepted.status).toBe(200);
    expect(operations.filter(op => op.kind === "update")).toHaveLength(1);
});

test("invalid planning inputs reject before required PPS worker work", async () => {
    const fixture = statsCompletionFixture(4);
    fixture.options.samplingInfo.samplingPolicy.methods.stratified = "disabled";
    fixture.options.samplingInfo.samplingPolicy.methods.pps = "required";
    const { module, readStats } = await load(fixture.record, fixture.options);
    const invalid = new Request("https://example.com/api/student/tasks/3/experiment/wave-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6, samplePlan: { finalSampleSize: 1e308 } }),
    });
    (invalid as Request & { params: Record<string, string> }).params = { id: "3" };
    expect((await module.wavePlanRoutes.POST!(invalid)).status).toBe(400);
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
    const questionnaire = validQuestionnaire();
    const samplePlan = { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 50 };
    const samplingResults = {
        simple: { completed: true, sampleCount: 50 },
        systematic: { completed: true, sampleCount: 50, interval: 4 },
    };
    const complete = experimentRecord({
        currentStage: 5,
        activeWaveNumber: 2,
        questionnaire,
        samplePlan,
        samplingResults,
        adjustmentPlan: {
            identifiedIssues: ["unit_nonresponse_gap"],
            plannedActions: ["recalibrate_sample_size"],
            rationale: "根据首轮试投无回答率重算正式轮样本量并完成多方法对比。",
            updatedAt: now.toISOString(),
        },
        wavesData: [
            {
                waveNumber: 1,
                kind: "pilot",
                label: "Wave 1",
                questionnaire,
                samplePlan,
                samplingResults: { simple: { completed: true, sampleCount: 50 } },
                fieldwork: null,
                cleaningConfig: { excludeSpeeders: true, excludeStraightliners: true },
                completedAt: now.toISOString(),
            },
            {
                waveNumber: 2,
                kind: "main",
                label: "Wave 2",
                questionnaire,
                samplePlan,
                samplingResults,
                fieldwork: null,
                cleaningConfig: { excludeSpeeders: true, excludeStraightliners: true },
                completedAt: now.toISOString(),
            },
        ],
        reportContent: `<p>${"这是用于课堂教学的完整分析报告内容。".repeat(12)}</p>`,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
        stage5CompletedAt: now,
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

test("a required PPS whose size field is unusable completes stage 4 instead of trapping the student", async () => {
    // Regression: a template published with pps=required over a population with no
    // eligible size field used to answer SAMPLING_RESULTS_REQUIRED forever.
    const q = validQuestionnaire();
    const plan = { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 50 };
    const stored = {
        simple: { completed: true, serverGenerated: true, sampleCount: 50, data: Array.from({ length: 50 }, (_, id) => ({ id })) },
        systematic: { completed: true, serverGenerated: true, sampleCount: 50, interval: 4, data: Array.from({ length: 50 }, (_, id) => ({ id: id * 4 })) },
        pps: { unavailable: true, unavailableReason: PPS_UNAVAILABLE_REASON, serverGenerated: true },
    };
    const record = experimentRecord({
        currentStage: 4,
        activeWaveNumber: 2,
        stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
        stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
        samplePlan: plan,
        samplingResults: stored,
        wavesData: [{
            waveNumber: 2,
            kind: "main",
            label: "Wave 2",
            questionnaire: q,
            samplePlan: plan,
            samplingResults: stored,
            fieldwork: fieldworkFor(["simple", "systematic"]),
            cleaningConfig: { excludeSpeeders: true, excludeStraightliners: true },
            completedAt: null,
        }],
    });
    const updated = { ...record, wavesData: [], samplingResults: null, currentStage: 5, version: 7 };
    const fixture = statsCompletionFixture(4);
    fixture.options.samplingInfo.samplingPolicy.methods.pps = "required";
    const { module } = await load(record, { ...fixture.options, update: [[updated]] });

    const response = await module.stageCompleteRoutes.POST!(post(4));

    expect(response.status).toBe(200);
});

test("fieldwork dispatch rejects invalid seeds and blocks stage 4 dispatch before formal sampling policy completes", async () => {
    const q = validQuestionnaire();
    const plan = { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 50, finalSampleSize: 2 };
    const csvPath = `/storage/dispatch-gate-${crypto.randomUUID()}.csv`;
    await Bun.write(`${process.cwd()}${csvPath}`, "id,group\n1,A\n2,A\n3,B\n4,B\n");
    try {
        const incompleteWave2 = experimentRecord({
            currentStage: 4,
            activeWaveNumber: 2,
            stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
            stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
            wavesData: [{
                waveNumber: 2,
                kind: "main",
                label: "Wave 2",
                questionnaire: q,
                samplePlan: plan,
                samplingResults: { simple: { completed: true, sampleCount: 2, indices: [0, 1], serverGenerated: true } },
                fieldwork: null,
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: null,
            }],
        });
        const { module, operations } = await load(incompleteWave2, {
            select: Array.from({ length: 6 }, () => [incompleteWave2]),
            samplingInfo: {
                excelFilePath: csvPath,
                fieldMapping: { identifier: "id", stratified: ["group"] },
                samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "required" } },
            },
        });

        // Invalid/negative/huge seed rejected at boundary with 400
        for (const badSeed of [-5, 1.5, "bad", Number.MAX_SAFE_INTEGER + 1]) {
            const seedReq = new Request("https://example.com/api/student/tasks/3/experiment/fieldwork/dispatch", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ observedVersion: 6, seed: badSeed }),
            });
            (seedReq as Request & { params?: Record<string, string> }).params = { id: "3" };
            const seedRes = await module.fieldworkDispatchRoutes.POST!(seedReq);
            expect(seedRes.status).toBe(400);
        }

        // Valid seed in Stage 4 still rejected with 409 because required stratified sampling is not completed
        const dispatchReq = new Request("https://example.com/api/student/tasks/3/experiment/fieldwork/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ observedVersion: 6, seed: 2026 }),
        });
        (dispatchReq as Request & { params?: Record<string, string> }).params = { id: "3" };
        const dispatchRes = await module.fieldworkDispatchRoutes.POST!(dispatchReq);
        expect(dispatchRes.status).toBe(409);
        expect(await dispatchRes.json()).toMatchObject({ error: { code: "SAMPLING_RESULTS_REQUIRED" } });
        expect(operations.some((op) => op.kind === "update")).toBe(false);
    } finally {
        await Bun.file(`${process.cwd()}${csvPath}`).delete().catch(() => undefined);
    }
});

test("fieldwork cleaning and new-wave routes enforce wave caps, wave ownership, and full dispatch prerequisites", async () => {
    const q = validQuestionnaire();
    const plan = { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 50, finalSampleSize: 50 };
    const stage4Record = experimentRecord({
        currentStage: 4,
        activeWaveNumber: 2,
        stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
        stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
        wavesData: [
            { waveNumber: 1, kind: "pilot", label: "Wave 1", questionnaire: q, samplePlan: plan, samplingResults: { simple: { completed: true, sampleCount: 50, serverGenerated: true } }, fieldwork: fieldworkFor(["simple"]), cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true }, completedAt: "2026-01-02T00:00:00Z" },
            {
                waveNumber: 2,
                kind: "main",
                label: "Wave 2",
                questionnaire: q,
                samplePlan: plan,
                samplingResults: {
                    simple: { completed: true, sampleCount: 50, serverGenerated: true },
                    systematic: { completed: true, sampleCount: 50, interval: 4, serverGenerated: true },
                },
                // systematic was re-sampled without re-dispatching
                fieldwork: fieldworkFor(["simple"]),
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: null,
            },
        ],
    });
    const { module } = await load(stage4Record, {
        select: Array.from({ length: 6 }, () => [stage4Record]),
        samplingInfo: {
            samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
        },
    });

    // Cleaning rejects invalid waveNumber and cross-stage Wave 1 mutation in Stage 4
    const badWaveClean = new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6, waveNumber: 9, cleaningConfig: { removeSpeeders: true } }),
    });
    (badWaveClean as Request & { params?: Record<string, string> }).params = { id: "3" };
    expect((await module.fieldworkCleaningRoutes.POST!(badWaveClean)).status).toBe(400);

    const badConfigClean = new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6, waveNumber: 2, cleaningConfig: { unknownFlag: true } }),
    });
    (badConfigClean as Request & { params?: Record<string, string> }).params = { id: "3" };
    expect((await module.fieldworkCleaningRoutes.POST!(badConfigClean)).status).toBe(400);

    const crossWaveClean = new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6, waveNumber: 1, cleaningConfig: { removeSpeeders: false } }),
    });
    (crossWaveClean as Request & { params?: Record<string, string> }).params = { id: "3" };
    expect((await module.fieldworkCleaningRoutes.POST!(crossWaveClean)).status).toBe(409);

    // new-wave rejects when a completed method in Wave 2 lacks dispatched fieldwork
    const newWaveReq = new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6 }),
    });
    (newWaveReq as Request & { params?: Record<string, string> }).params = { id: "3" };
    const newWaveRes = await module.newWaveRoutes.POST!(newWaveReq);
    expect(newWaveRes.status).toBe(409);
    expect(await newWaveRes.json()).toMatchObject({ error: { code: "FIELDWORK_REQUIRED" } });

    // 4-wave cap enforced with WAVE_LIMIT
    const fourWavesRecord = experimentRecord({
        currentStage: 4,
        activeWaveNumber: 4,
        wavesData: [1, 2, 3, 4].map((n) => ({
            waveNumber: n,
            kind: n === 1 ? "pilot" : n === 2 ? "main" : "refinement",
            label: `Wave ${n}`,
            questionnaire: q,
            samplePlan: plan,
            samplingResults: { simple: { completed: true, sampleCount: 50, serverGenerated: true } },
            fieldwork: fieldworkFor(["simple"]),
            cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
            completedAt: n < 4 ? "2026-01-02T00:00:00Z" : null,
        })),
    });
    const capped = await load(fourWavesRecord);
    const capReq = new Request("https://example.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6 }),
    });
    (capReq as Request & { params?: Record<string, string> }).params = { id: "3" };
    const capRes = await capped.module.newWaveRoutes.POST!(capReq);
    expect(capRes.status).toBe(400);
    expect(await capRes.json()).toMatchObject({ error: { code: "WAVE_LIMIT" } });
});
