import { expect, mock, test } from "bun:test";
import {
    autoBindQuestionnaireVariables,
    DEFAULT_CLEANING_CONFIG,
    type StoredExperimentWave,
} from "../../domain/fieldwork";
import { buildPopulationNumericStats } from "../../domain/statistics/population";
import {
    createTeaPricingDictionary,
    teaPricingFieldMapping,
    teaPricingFieldworkConfig,
    teaPricingQuestionnaire,
} from "../../db/seeds/happiness-topic";
import { createTeaPricingPopulation } from "../../db/seeds/dogfood-fixtures";
import { createStudentAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";
import type { PopulationStats } from "../experiment/population-stats-job";
import { calculateMeanEstimationSampleSize, finitePopulationS2ToSigma2 } from "../experiment/sample-plan";
import { executeSamplingAction } from "../experiment/sampling-service";
import { compactSamplingResults } from "../experiment/sampling-storage";
import {
    buildWaveDiagnosticsMap,
    simulateWaveDispatchForCompletedMethods,
} from "../experiment/fieldwork-wave-service";

async function createMultiMethodFixture() {
    const population = createTeaPricingPopulation();
    const dictionary = createTeaPricingDictionary("tea-route-qa-s2-03", 1);
    const { questionnaire } = autoBindQuestionnaireVariables({
        questionnaire: teaPricingQuestionnaire,
        dictionary,
        taskId: 3,
        targetField: "最高支付意愿",
    });

    const w1Simple = await executeSamplingAction({
        method: "simple",
        population,
        targetSampleSize: 24,
        rawParams: { sampleSize: 24, seed: 20261121 },
        fieldMapping: teaPricingFieldMapping,
    });
    if (!w1Simple.ok) throw new Error(w1Simple.errorMessage);
    const w1Stratified = await executeSamplingAction({
        method: "stratified",
        population,
        targetSampleSize: 24,
        rawParams: {
            stratifyBy: "会员等级",
            layers: [
                { name: "普通会员", sampleCount: 8 },
                { name: "银卡会员", sampleCount: 8 },
                { name: "黑金会员", sampleCount: 8 },
            ],
            seed: 20261122,
        },
        fieldMapping: teaPricingFieldMapping,
    });
    if (!w1Stratified.ok) throw new Error(w1Stratified.errorMessage);
    const w1SamplingResults = compactSamplingResults({
        simple: { ...w1Simple.result, serverGenerated: true },
        stratified: { ...w1Stratified.result, serverGenerated: true },
    }) as Record<string, unknown>;

    const baseWave1: StoredExperimentWave = {
        waveNumber: 1,
        kind: "pilot",
        label: "第 1 轮 · 首轮试投",
        questionnaire,
        samplePlan: {
            estimationType: "mean",
            confidenceLevel: "95",
            marginOfError: 2,
            populationVariance: 16,
            varianceSource: "prior_estimate",
            designEffect: 1,
            nonResponseRate: 0.1,
            recommendedSize: 24,
            finalSampleSize: 24,
        },
        samplingResults: w1SamplingResults,
        fieldwork: null,
        cleaningConfig: { ...DEFAULT_CLEANING_CONFIG },
        completedAt: "2026-11-24T02:00:00.000Z",
    };

    const w1Dispatch = simulateWaveDispatchForCompletedMethods({
        wave: baseWave1,
        population,
        fieldMapping: teaPricingFieldMapping,
        fieldworkConfig: teaPricingFieldworkConfig,
        dictionary,
        seed: 20261124,
    });
    if (!w1Dispatch.ok) throw new Error(w1Dispatch.message);
    const wave1: StoredExperimentWave = { ...baseWave1, fieldwork: w1Dispatch.fieldwork };

    const diagMap = buildWaveDiagnosticsMap({
        wave: wave1,
        population,
        fieldMapping: teaPricingFieldMapping,
        fieldworkConfig: teaPricingFieldworkConfig,
        dictionary,
    });
    const simpleVar = diagMap.simple?.empiricalTargetVariance!;
    const stratifiedVar = diagMap.stratified?.empiricalTargetVariance!;
    expect(simpleVar).toBeGreaterThan(0);
    expect(stratifiedVar).toBeGreaterThan(0);
    expect(Math.abs(simpleVar - stratifiedVar) / simpleVar).toBeGreaterThan(1e-3);

    const popStat = buildPopulationNumericStats(population, ["最高支付意愿"])["最高支付意愿"]!;
    const actualPopVariance = finitePopulationS2ToSigma2(popStat.variance, popStat.count)!;
    const stats: PopulationStats = {
        stats: { 会员等级: { 普通会员: 96, 银卡会员: 84, 黑金会员: 60 } },
        numericFields: ["最高支付意愿"],
        categoricalFields: ["会员等级"],
        categoricalStats: { 会员等级: { 普通会员: 96, 银卡会员: 84, 黑金会员: 60 } },
        populationNumericStats: { 最高支付意愿: popStat },
        ppsEligibleFields: [],
        stratumNumericStats: {},
    };

    const makeWave2Plan = (populationVariance: number, varianceSource: "wave1_empirical" | "population") => {
        const recommendedSize = calculateMeanEstimationSampleSize({
            confidenceLevel: "95",
            marginOfError: 2,
            populationSize: population.length,
            populationVariance,
            designEffect: 1,
            nonResponseRate: 0,
        })!;
        return {
            estimationType: "mean",
            confidenceLevel: "95",
            marginOfError: 2,
            populationVariance,
            varianceSource,
            designEffect: 1,
            nonResponseRate: 0,
            recommendedSize,
            finalSampleSize: Math.max(40, recommendedSize),
        };
    };

    const buildWave2 = async (samplePlan: Record<string, unknown>) => {
        const targetSize = Number(samplePlan.finalSampleSize);
        const simpleSampled = await executeSamplingAction({
            method: "simple",
            population,
            targetSampleSize: targetSize,
            rawParams: { sampleSize: targetSize, seed: 20261125 },
            fieldMapping: teaPricingFieldMapping,
        });
        if (!simpleSampled.ok) throw new Error(simpleSampled.errorMessage);
        const systematicSampled = await executeSamplingAction({
            method: "systematic",
            population,
            targetSampleSize: targetSize,
            rawParams: { seed: 20261126 },
            fieldMapping: teaPricingFieldMapping,
        });
        if (!systematicSampled.ok) throw new Error(systematicSampled.errorMessage);
        const samplingResults = compactSamplingResults({
            simple: { ...simpleSampled.result, serverGenerated: true },
            systematic: { ...systematicSampled.result, serverGenerated: true },
        }) as Record<string, unknown>;
        const baseWave2: StoredExperimentWave = {
            waveNumber: 2,
            kind: "main",
            label: "第 2 轮 · 调优正式投放",
            questionnaire,
            samplePlan,
            samplingResults,
            fieldwork: null,
            cleaningConfig: { ...DEFAULT_CLEANING_CONFIG },
            completedAt: null,
        };
        const dispatched = simulateWaveDispatchForCompletedMethods({
            wave: baseWave2,
            population,
            fieldMapping: teaPricingFieldMapping,
            fieldworkConfig: teaPricingFieldworkConfig,
            dictionary,
            seed: 20261125,
        });
        if (!dispatched.ok) throw new Error(dispatched.message);
        return {
            wave2: { ...baseWave2, fieldwork: dispatched.fieldwork } as StoredExperimentWave,
            samplingResults,
        };
    };

    return {
        population,
        dictionary,
        questionnaire,
        wave1,
        simpleVar,
        stratifiedVar,
        actualPopVariance,
        stats,
        makeWave2Plan,
        buildWave2,
    };
}

function makeExperimentRecord(params: {
    questionnaire: unknown;
    samplePlan: Record<string, unknown>;
    samplingResults: Record<string, unknown>;
    wavesData: StoredExperimentWave[];
    currentStage: 4 | 5;
}) {
    const now = new Date("2026-11-24T03:00:00.000Z");
    return {
        id: 9,
        studentId: 2,
        taskId: 3,
        version: 6,
        samplingGeneration: 2,
        analysisReferences: [],
        status: "in_progress",
        currentStage: params.currentStage,
        activeWaveNumber: 2,
        questionnaire: params.questionnaire,
        samplePlan: params.samplePlan,
        samplingResults: params.samplingResults,
        adjustmentPlan: {
            identifiedIssues: ["unit_nonresponse_gap"],
            plannedActions: ["recalibrate_sample_size"],
            rationale: "首轮试投完成多方法抽样，二轮代入分层试投实测方差重算样本量。",
            updatedAt: now.toISOString(),
        },
        wavesData: params.wavesData,
        reportContent: params.currentStage === 5 ? `<p>${"这是用于课堂教学的完整分析报告内容。".repeat(12)}</p>` : null,
        stage1CompletedAt: now,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: params.currentStage === 5 ? now : null,
        stage5CompletedAt: params.currentStage === 5 ? now : null,
        submissionSnapshot: null,
        submittedAt: null,
        scoreQuestionnaire: null,
        scoreProcess: null,
        scoreReport: null,
        totalScore: null,
        teacherComment: null,
        rejectReason: null,
        gradedByTeacherId: null,
        gradedAt: null,
        createdAt: now,
        updatedAt: now,
    };
}

test("QA-S2-03 live routes (wave-plan & stage 4 complete) accept non-first Wave 1 method variance and reject population σ² labeled wave1_empirical", async () => {
    const fx = await createMultiMethodFixture();
    const stratifiedPlan = fx.makeWave2Plan(fx.stratifiedVar, "wave1_empirical");
    const mismatchedPlan = fx.makeWave2Plan(fx.actualPopVariance, "wave1_empirical");
    const { wave2, samplingResults } = await fx.buildWave2(stratifiedPlan);
    const stage4Record = makeExperimentRecord({
        questionnaire: fx.questionnaire,
        samplePlan: stratifiedPlan,
        samplingResults,
        wavesData: [fx.wave1, wave2],
        currentStage: 4,
    });
    const updatedAfterPlan = { ...stage4Record, version: 7, wavesData: [], samplingResults: null };
    const updatedAfterStage4 = { ...stage4Record, version: 7, currentStage: 5, wavesData: [], samplingResults: null };

    const samplingInfo = {
        excelFilePath: "/virtual/tea-pricing.csv",
        fieldMapping: teaPricingFieldMapping,
        fieldworkConfig: teaPricingFieldworkConfig,
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
        variableDictionary: fx.dictionary,
        variableRevision: 1,
    };

    const loadMod = async (dbOptions: Parameters<typeof createMockDb>[0]) => {
        const { db } = createMockDb(dbOptions);
        mock.module("../../db", () => ({ db }));
        mock.module("../experiment/population-data", () => ({
            readPopulationData: async () => fx.population,
        }));
        mock.module("../../server/variable-source", () => ({
            canonicalJson: (value: unknown) => JSON.stringify(value),
            readVariableSource: async () => ({
                source: fx.dictionary.source,
                fileHash: "tea-hash",
                rows: fx.population,
                designRows: fx.population,
                parserVersion: "raw-values-v1",
            }),
        }));
        mock.module("../experiment/population-stats-service", () => ({
            populationStatsService: { run: async () => fx.stats },
            populationRevisionKey: () => "tea-rev",
        }));
        mock.module("./auth", () => createStudentAuthModuleMock({
            requireAuth: async () => ({ student: { id: 2, studentId: "S001", name: "学生一", classId: 7 }, error: null }),
        }));
        mock.module("../experiment/task-access", () => ({
            getStudentTaskAccessError: async () => null,
            getStudentTopicAttachmentAccessError: async () => null,
        }));
        mock.module("../experiment/task-info", () => ({
            findStudentTaskPopulationSize: async () => fx.population.length,
            findStudentTaskSamplingInfo: async () => samplingInfo,
            findStudentTaskSchedule: async () => ({ openTime: null, deadline: new Date(Date.now() + 60_000) }),
            findStudentTaskSubmitInfo: async () => null,
            findStudentTaskTopicInfo: async () => ({ id: 3, topicId: 4 }),
        }));
        return await import(`./experiment.ts?qa-s2-03=${crypto.randomUUID()}`);
    };

    // 1) wave-plan accepts non-first Wave 1 method (stratified) empirical variance
    const mod1 = await loadMod({ select: [[stage4Record], []], update: [[updatedAfterPlan]] });
    const planOkReq = new Request("https://example.com/api/student/tasks/3/experiment/wave-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6, samplePlan: stratifiedPlan }),
    });
    (planOkReq as Request & { params?: Record<string, string> }).params = { id: "3" };
    const planOkRes = await mod1.wavePlanRoutes.POST!(planOkReq);
    expect(planOkRes.status).toBe(200);

    // 2) wave-plan rejects population σ² paired with varianceSource: "wave1_empirical" (400)
    const mod2 = await loadMod({ select: [[stage4Record]] });
    const planBadReq = new Request("https://example.com/api/student/tasks/3/experiment/wave-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6, samplePlan: mismatchedPlan }),
    });
    (planBadReq as Request & { params?: Record<string, string> }).params = { id: "3" };
    const planBadRes = await mod2.wavePlanRoutes.POST!(planBadReq);
    expect(planBadRes.status).toBe(400);
    expect((await planBadRes.json() as { error: { message: string } }).error.message).toMatch(/首轮实测样本方差/);

    // 3) stage 4 complete accepts non-first Wave 1 method (stratified) empirical variance
    const mod3 = await loadMod({ select: [[stage4Record], []], update: [[updatedAfterStage4]] });
    const stageOkReq = new Request("https://example.com/api/student/tasks/3/experiment/stages/4/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6, samplePlan: stratifiedPlan }),
    });
    (stageOkReq as Request & { params?: Record<string, string> }).params = { id: "3", stage: "4" };
    const stageOkRes = await mod3.stageCompleteRoutes.POST!(stageOkReq);
    expect(stageOkRes.status).toBe(200);

    // 4) stage 4 complete rejects population σ² paired with varianceSource: "wave1_empirical" (400)
    const mod4 = await loadMod({ select: [[stage4Record]] });
    const stageBadReq = new Request("https://example.com/api/student/tasks/3/experiment/stages/4/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observedVersion: 6, samplePlan: mismatchedPlan }),
    });
    (stageBadReq as Request & { params?: Record<string, string> }).params = { id: "3", stage: "4" };
    const stageBadRes = await mod4.stageCompleteRoutes.POST!(stageBadReq);
    expect(stageBadRes.status).toBe(400);
    expect((await stageBadRes.json() as { error: { message: string } }).error.message).toMatch(/首轮实测样本方差/);
});

test("QA-S2-03 submit-service accepts non-first Wave 1 method variance and rejects population σ² labeled wave1_empirical", async () => {
    const fx = await createMultiMethodFixture();
    const stratifiedPlan = fx.makeWave2Plan(fx.stratifiedVar, "wave1_empirical");
    const mismatchedPlan = fx.makeWave2Plan(fx.actualPopVariance, "wave1_empirical");
    const { wave2, samplingResults } = await fx.buildWave2(stratifiedPlan);
    const wave2Completed: StoredExperimentWave = { ...wave2, completedAt: "2026-11-24T03:00:00.000Z" };

    const { db } = createMockDb({ update: [[{ id: 9 }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("../../server/variable-source", () => ({
        canonicalJson: (value: unknown) => JSON.stringify(value),
        readVariableSource: async () => ({
            source: fx.dictionary.source,
            fileHash: "tea-hash",
            rows: fx.population,
            designRows: fx.population,
            parserVersion: "raw-values-v1",
        }),
    }));

    const { submitStudentExperiment } = await import(`../experiment/submit-service.ts?qa-s2-03=${crypto.randomUUID()}`);
    const taskInfo = {
        taskId: 3,
        topicName: "茶饮新品定价实验",
        populationSize: fx.population.length,
        excelFilePath: "/virtual/tea-pricing.csv",
        fieldMapping: teaPricingFieldMapping,
        fieldworkConfig: teaPricingFieldworkConfig,
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
        variableDictionary: fx.dictionary,
        variableRevision: 1,
    };

    const okRecord = makeExperimentRecord({
        questionnaire: fx.questionnaire,
        samplePlan: stratifiedPlan,
        samplingResults,
        wavesData: [fx.wave1, wave2Completed],
        currentStage: 5,
    });
    const okRes = await submitStudentExperiment({
        experimentRecord: okRecord as any,
        observedVersion: 6,
        taskInfo,
        student: { studentId: "S001", name: "学生一" },
    });
    expect(okRes).toMatchObject({ ok: true, experimentId: 9 });

    const badRecord = makeExperimentRecord({
        questionnaire: fx.questionnaire,
        samplePlan: mismatchedPlan,
        samplingResults,
        wavesData: [fx.wave1, { ...wave2Completed, samplePlan: mismatchedPlan }],
        currentStage: 5,
    });
    const badRes = await submitStudentExperiment({
        experimentRecord: badRecord as any,
        observedVersion: 6,
        taskInfo,
        student: { studentId: "S001", name: "学生一" },
    });
    expect(badRes).toMatchObject({ ok: false, code: "INCOMPLETE", status: 400 });
    if (!badRes.ok) expect(badRes.message).toMatch(/首轮实测样本方差/);
});
