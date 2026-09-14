import { expect, test } from "bun:test";
import { buildStageCompletionUpdates, buildStageReopenUpdates } from "./update-service";

function record(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        studentId: 2,
        taskId: 3,
        version: 4,
        samplingGeneration: 7,
        analysisReferences: [12],
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
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as any;
}

test("completing the current stage saves it and advances once", () => {
    const result = buildStageCompletionUpdates({
        experimentRecord: record(),
        stage: 2,
        payload: {
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 5,
                designEffect: 1,
                nonResponseRate: 0,
                recommendedSize: 132,
                finalSampleSize: 50,
            },
        },
        populationSize: 200,
        deadlinePassed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updates.currentStage).toBe(3);
    expect(result.updates.version).toBe(5);
    expect(result.updates.stage2CompletedAt).toBeInstanceOf(Date);
    expect(result.updates.samplePlan).toMatchObject({ finalSampleSize: 50 });
});

test("new stage-1 saves reject repeated options before any stage update", () => {
    const result = buildStageCompletionUpdates({
        experimentRecord: record({ currentStage: 1, stage1CompletedAt: null }), stage: 1,
        payload: { questionnaire: { title: "调查", welcomeText: "欢迎参加本次调查，请认真填写所有问题，感谢配合。", endingText: "感谢您完成本次调查，您的回答仅用于课堂教学研究。",
            questions: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, type: "single", content: "请选择", options: i === 0 ? ["同意", " 同意 "] : ["是", "否"] })),
        } }, populationSize: 200, deadlinePassed: false,
    });
    expect(result).toMatchObject({ ok: false, message: "第1题选项内容重复，请修改后重试" });
});

test("stage 2 rejects a proportion plan on a mean-locked topic", () => {
    const result = buildStageCompletionUpdates({
        experimentRecord: record(),
        stage: 2,
        payload: {
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 5,
                designEffect: 1,
                nonResponseRate: 0,
                recommendedSize: 132,
                finalSampleSize: 50,
            },
        },
        populationSize: 200,
        deadlinePassed: false,
        fieldMapping: {
            numeric: ["每周学习时长"],
            analysisTarget: { kind: "mean", field: "每周学习时长" },
        },
    });
    expect(result).toMatchObject({ ok: false, message: "估计类型需与研究目标变量一致" });
});

test("a stage cannot be saved out of order", () => {
    const result = buildStageCompletionUpdates({
        experimentRecord: record(),
        stage: 3,
        payload: {},
        populationSize: 200,
        deadlinePassed: false,
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_STAGE_ORDER" });
});

test("reopening a completed stage keeps that stage data and clears downstream data", () => {
    const savedPlan = { confidenceLevel: "95", marginOfError: 5, finalSampleSize: 50 };
    const result = buildStageReopenUpdates({
        experimentRecord: record({
            currentStage: 4,
            samplePlan: savedPlan,
            samplingResults: { simple: { completed: true } },
            reportContent: "报告内容",
            stage2CompletedAt: new Date(),
            stage3CompletedAt: new Date(),
            stage4CompletedAt: new Date(),
        }),
        stage: 2,
        deadlinePassed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updates).toMatchObject({
        version: 5,
        currentStage: 2,
        stage2CompletedAt: null,
        samplingResults: null,
        reportContent: null,
        stage3CompletedAt: null,
        stage4CompletedAt: null,
    });
    expect(result.updates.samplePlan).toBeUndefined();
});

test("upstream reopens advance the sampling generation; report-only editing preserves it and references", () => {
    const original = record({ currentStage: 4, stage2CompletedAt: new Date(), stage3CompletedAt: new Date(), stage4CompletedAt: new Date() });
    for (const stage of [1, 2, 3, 4]) {
        const result = buildStageReopenUpdates({ experimentRecord: original, stage, deadlinePassed: false });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.message);
        if (stage < 4) expect(result.updates).toMatchObject({ samplingGeneration: 8, analysisReferences: [] });
        else {
            expect(result.updates).not.toHaveProperty("samplingGeneration");
            expect(result.updates).not.toHaveProperty("analysisReferences");
        }
    }
});

test("required stratification blocks a saved plan below H and uses any complete available frame", () => {
    const samplingPolicy = { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "required" } };
    const base = { experimentRecord: record(), stage: 2, populationSize: 30, deadlinePassed: false, samplingPolicy,
        fieldMapping: { numeric: ["y"], stratified: ["fine", "coarse"], analysisTarget: { kind: "mean", field: "y" } },
        stratifiedStats: { fine: { A: 10, B: 10, C: 10 }, coarse: { X: 15, Y: 15 } } };
    const payload = (n: number) => ({ samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: 10,
        populationVariance: .25, designEffect: 1, nonResponseRate: 0, recommendedSize: 1, finalSampleSize: n } });
    expect(buildStageCompletionUpdates({ ...base, payload: payload(1) })).toMatchObject({ ok: false, message: "必做分层抽样至少需要 2 个样本，以覆盖每个非空层" });
    expect(buildStageCompletionUpdates({ ...base, payload: payload(2) }).ok).toBe(true);
    expect(buildStageCompletionUpdates({ ...base, stratifiedStats: { singleton: { A: 1, B: 29 } }, payload: payload(2) }).ok).toBe(true);
    expect(buildStageCompletionUpdates({ ...base, stratifiedStats: { incomplete: { A: 1, B: 20 } }, payload: payload(2) }).ok).toBe(false);
    for (const requirement of ["optional", "disabled"]) {
        expect(buildStageCompletionUpdates({ ...base, payload: payload(1), stratifiedStats: undefined,
            samplingPolicy: { ...samplingPolicy, methods: { ...samplingPolicy.methods, stratified: requirement } } }).ok).toBe(true);
    }
});

test("a non-string report payload is rejected by type instead of a misleading word-count error", () => {
    const record = {
        id: 1, studentId: 2, taskId: 3, version: 4, status: "in_progress" as const,
        currentStage: 4, questionnaire: null, samplePlan: null, samplingResults: null, reportContent: null,
        stage1CompletedAt: new Date(), stage2CompletedAt: new Date(), stage3CompletedAt: new Date(), stage4CompletedAt: null,
        createdAt: new Date(), updatedAt: new Date(), rejectReason: null,
    };
    const result = buildStageCompletionUpdates({
        experimentRecord: record as never,
        stage: 4,
        payload: { reportContent: { background: "结构化对象" } },
        populationSize: 100,
        deadlinePassed: false,
        fieldMapping: null,
        samplingPolicy: null,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toBe("报告内容格式无效，请重新编辑后再提交");
    // 空内容仍按字数提示，便于学生理解该写什么
    const empty = buildStageCompletionUpdates({
        experimentRecord: record as never,
        stage: 4,
        payload: { reportContent: "" },
        populationSize: 100,
        deadlinePassed: false,
        fieldMapping: null,
        samplingPolicy: null,
    });
    expect(empty.ok === false && empty.message).toBe("本实验要求报告内容不少于100字");
});
