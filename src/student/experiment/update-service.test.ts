import { expect, test } from "bun:test";
import { calculateMeanEstimationSampleSize } from "./sample-plan";
import { buildStageCompletionUpdates, buildStageReopenUpdates } from "./update-service";

function validQuestionnaire() {
    return {
        title: "商业统计调研问卷",
        welcomeText: "欢迎参加本次商业调研，所有信息匿名保密，预计3分钟。",
        endingText: "感谢您的配合与支持，祝您生活愉快，谢谢参与。",
        questions: Array.from({ length: 5 }, (_, i) => ({
            id: `q${i}`,
            type: "boolean" as const,
            content: `这是第${i + 1}道商业调查问题吗？`,
        })),
    };
}

function fieldworkFor(methods: string[]) {
    return {
        methods: Object.fromEntries(methods.map((method) => [
            method,
            {
                method,
                dispatchSeed: 2026,
                dispatchedAt: "2026-01-01T00:00:00Z",
                invitedCount: 2,
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

function record(overrides: Record<string, unknown> = {}) {
    const q = validQuestionnaire();
    return {
        id: 1,
        studentId: 2,
        taskId: 3,
        version: 4,
        samplingGeneration: 7,
        analysisReferences: [12],
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
                label: "第 1 轮 · 首轮试投",
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

test("ST-B2 stage completion persists the recomputed 458-unit invitation plan", () => {
    const result = buildStageCompletionUpdates({
        experimentRecord: record(),
        stage: 2,
        payload: { samplePlan: {
            estimationType: "proportion",
            confidenceLevel: "95",
            marginOfError: 5,
            designEffect: 1.5,
            nonResponseRate: 0.2,
            recommendedSize: 458,
            finalSampleSize: 458,
        } },
        populationSize: 1000,
        deadlinePassed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updates.samplePlan).toMatchObject({
        recommendedSize: 458,
        finalSampleSize: 458,
        calculatedSampleSize: 458,
    });
});

test("stage 3 validates adjustmentPlan and initializes Wave 2 formal fieldwork", () => {
    const stage3Record = record({
        currentStage: 3,
        stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
    });
    const invalid = buildStageCompletionUpdates({
        experimentRecord: stage3Record,
        stage: 3,
        payload: { adjustmentPlan: { identifiedIssues: [], plannedActions: [], rationale: "太短" } },
        populationSize: 200,
        deadlinePassed: false,
    });
    expect(invalid.ok).toBe(false);

    const valid = buildStageCompletionUpdates({
        experimentRecord: stage3Record,
        stage: 3,
        payload: {
            adjustmentPlan: {
                identifiedIssues: ["unit_nonresponse_gap", "stratum_coverage_skew"],
                plannedActions: ["recalibrate_sample_size", "upgrade_stratified_design"],
                rationale: "首轮普通会员拒访率显著偏高，决定代入实测无回答率重算样本量并升级分层抽样。",
            },
        },
        populationSize: 200,
        deadlinePassed: false,
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.updates.currentStage).toBe(4);
    expect(valid.updates.activeWaveNumber).toBe(2);
    expect((valid.updates.wavesData as unknown[]).length).toBe(2);
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
            currentStage: 5,
            activeWaveNumber: 2,
            samplePlan: savedPlan,
            samplingResults: { simple: { completed: true } },
            adjustmentPlan: { identifiedIssues: ["unit_nonresponse_gap"], plannedActions: ["recalibrate_sample_size"], rationale: "调整说明理由超过十五个字。" },
            reportContent: "报告内容",
            stage2CompletedAt: new Date(),
            stage3CompletedAt: new Date(),
            stage4CompletedAt: new Date(),
            stage5CompletedAt: new Date(),
        }),
        stage: 2,
        deadlinePassed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updates).toMatchObject({
        version: 5,
        currentStage: 2,
        activeWaveNumber: 1,
        adjustmentPlan: null,
        reportContent: null,
        stage2CompletedAt: null,
        stage3CompletedAt: null,
        stage4CompletedAt: null,
        stage5CompletedAt: null,
    });
    expect(result.updates.samplePlan).toBeUndefined();
});

test("upstream reopens advance the sampling generation; report-only editing preserves it and references", () => {
    const original = record({
        currentStage: 5,
        stage2CompletedAt: new Date(),
        stage3CompletedAt: new Date(),
        stage4CompletedAt: new Date(),
        stage5CompletedAt: new Date(),
    });
    for (const stage of [1, 2, 3, 4, 5]) {
        const result = buildStageReopenUpdates({ experimentRecord: original, stage, deadlinePassed: false });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.message);
        if (stage <= 4) expect(result.updates).toMatchObject({ samplingGeneration: 8, analysisReferences: [] });
        else {
            expect(result.updates).not.toHaveProperty("samplingGeneration");
            expect(result.updates).not.toHaveProperty("analysisReferences");
        }
    }
});

test("required stratification blocks a saved plan below H and uses any complete available frame", () => {
    const samplingPolicy = { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "required" } };
    const formalRecord = (n: number) => {
        const q = validQuestionnaire();
        const sampling = n >= 2
            ? {
                simple: { completed: true, sampleCount: n, serverGenerated: true },
                stratified: { completed: true, sampleCount: n, stratifyBy: "coarse", layers: [{ name: "X", sampleCount: 1 }, { name: "Y", sampleCount: n - 1 }], serverGenerated: true },
            }
            : {
                simple: { completed: true, sampleCount: n, serverGenerated: true },
                systematic: { completed: true, sampleCount: n, interval: 30, serverGenerated: true },
            };
        const fw = n >= 2 ? fieldworkFor(["simple", "stratified"]) : fieldworkFor(["simple", "systematic"]);
        return record({
            currentStage: 4,
            activeWaveNumber: 2,
            stage2CompletedAt: new Date(),
            stage3CompletedAt: new Date(),
            wavesData: [
                {
                    waveNumber: 1,
                    kind: "pilot",
                    label: "Wave 1",
                    questionnaire: q,
                    samplePlan: null,
                    samplingResults: { simple: { completed: true, sampleCount: 5 } },
                    fieldwork: fieldworkFor(["simple"]),
                    cleaningConfig: { excludeSpeeders: true, excludeStraightliners: true },
                    completedAt: "2026-01-01T00:00:00Z",
                },
                {
                    waveNumber: 2,
                    kind: "main",
                    label: "Wave 2",
                    questionnaire: q,
                    samplePlan: null,
                    samplingResults: sampling,
                    fieldwork: fw,
                    cleaningConfig: { excludeSpeeders: true, excludeStraightliners: true },
                    completedAt: null,
                },
            ],
        });
    };
    const base = {
        stage: 4,
        populationSize: 30,
        deadlinePassed: false,
        samplingPolicy,
        populationVariance: 0.25,
        fieldMapping: { numeric: ["y"], stratified: ["fine", "coarse"], analysisTarget: { kind: "mean", field: "y" } },
        stratifiedStats: { fine: { A: 10, B: 10, C: 10 }, coarse: { X: 15, Y: 15 } },
    };
    const payload = (n: number) => ({ samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: 10,
        populationVariance: .25, designEffect: 1, nonResponseRate: 0, recommendedSize: 1, finalSampleSize: n } });
    expect(buildStageCompletionUpdates({ ...base, experimentRecord: formalRecord(1), payload: payload(1) })).toMatchObject({ ok: false, message: "必做分层抽样至少需要 2 个样本，以覆盖每个非空层" });
    expect(buildStageCompletionUpdates({ ...base, experimentRecord: formalRecord(2), payload: payload(2) }).ok).toBe(true);
    expect(buildStageCompletionUpdates({ ...base, experimentRecord: formalRecord(2), stratifiedStats: { singleton: { A: 1, B: 29 } }, payload: payload(2) }).ok).toBe(true);
    expect(buildStageCompletionUpdates({ ...base, experimentRecord: formalRecord(2), stratifiedStats: { incomplete: { A: 1, B: 20 } }, payload: payload(2) }).ok).toBe(false);
    for (const requirement of ["optional", "disabled"]) {
        expect(buildStageCompletionUpdates({
            ...base,
            experimentRecord: formalRecord(1),
            payload: payload(1),
            stratifiedStats: undefined,
            samplingPolicy: { ...samplingPolicy, methods: { ...samplingPolicy.methods, stratified: requirement } },
        }).ok).toBe(true);
    }
});

test("a non-string report payload is rejected by type instead of a misleading word-count error", () => {
    const expRecord = {
        id: 1, studentId: 2, taskId: 3, version: 4, status: "in_progress" as const,
        currentStage: 5, questionnaire: null, samplePlan: null, samplingResults: null, reportContent: null,
        stage1CompletedAt: new Date(), stage2CompletedAt: new Date(), stage3CompletedAt: new Date(), stage4CompletedAt: new Date(), stage5CompletedAt: null,
        createdAt: new Date(), updatedAt: new Date(), rejectReason: null,
    };
    const result = buildStageCompletionUpdates({
        experimentRecord: expRecord as never,
        stage: 5,
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
        experimentRecord: expRecord as never,
        stage: 5,
        payload: { reportContent: "" },
        populationSize: 100,
        deadlinePassed: false,
        fieldMapping: null,
        samplingPolicy: null,
    });
    expect(empty.ok === false && empty.message).toBe("本实验要求报告内容不少于100字");
});

test("stage 2 requires fieldwork for every completed method and rejects undispatched plan size edits", () => {
    const q = validQuestionnaire();
    const partialFieldworkRecord = record({
        wavesData: [{
            waveNumber: 1,
            kind: "pilot",
            label: "第 1 轮 · 首轮试投",
            questionnaire: q,
            samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 50 },
            samplingResults: {
                simple: { completed: true, sampleCount: 50, serverGenerated: true },
                systematic: { completed: true, sampleCount: 50, interval: 4, serverGenerated: true },
            },
            fieldwork: fieldworkFor(["simple"]),
            cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
            completedAt: null,
        }],
    });
    expect(buildStageCompletionUpdates({
        experimentRecord: partialFieldworkRecord,
        stage: 2,
        payload: {},
        populationSize: 200,
        deadlinePassed: false,
    })).toMatchObject({ ok: false, code: "FIELDWORK_REQUIRED", status: 409 });

    const planChangedRecord = record({
        wavesData: [{
            waveNumber: 1,
            kind: "pilot",
            label: "第 1 轮 · 首轮试投",
            questionnaire: q,
            samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 50 },
            samplingResults: { simple: { completed: true, sampleCount: 50, serverGenerated: true } },
            fieldwork: fieldworkFor(["simple"]),
            cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
            completedAt: null,
        }],
    });
    expect(buildStageCompletionUpdates({
        experimentRecord: planChangedRecord,
        stage: 2,
        payload: {
            samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 80 },
        },
        populationSize: 200,
        deadlinePassed: false,
    })).toMatchObject({ ok: false, code: "FIELDWORK_REQUIRED", status: 409 });
});

test("stage 3 clears top-level pilot samplingResults and stage 4 rejects undispatched questionnaire or plan edits", () => {
    const q1 = validQuestionnaire();
    const q2 = { ...validQuestionnaire(), title: "二轮修订问卷" };
    const plan1 = { confidenceLevel: "95", marginOfError: 8, designEffect: 1, nonResponseRate: 0, recommendedSize: 86, finalSampleSize: 30 };
    const plan2 = { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0.2, recommendedSize: 165, finalSampleSize: 60 };

    const stage3Result = buildStageCompletionUpdates({
        experimentRecord: record({
            currentStage: 3,
            stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
            samplePlan: plan1,
            samplingResults: { simple: { completed: true, sampleCount: 30, serverGenerated: true } },
            wavesData: [{
                waveNumber: 1,
                kind: "pilot",
                label: "第 1 轮 · 首轮试投",
                questionnaire: q1,
                samplePlan: plan1,
                samplingResults: { simple: { completed: true, sampleCount: 30, serverGenerated: true } },
                fieldwork: fieldworkFor(["simple"]),
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: "2026-01-02T00:00:00Z",
            }],
        }),
        stage: 3,
        payload: {
            adjustmentPlan: {
                identifiedIssues: ["unit_nonresponse_gap"],
                plannedActions: ["recalibrate_sample_size"],
                rationale: "首轮试投后根据实测拒访率重算二轮正式样本量并优化问卷。",
            },
        },
        populationSize: 200,
        deadlinePassed: false,
    });
    expect(stage3Result.ok).toBe(true);
    if (!stage3Result.ok) return;
    expect(stage3Result.updates.samplingResults).toBeNull();

    const stage4EmptyWave2 = record({
        currentStage: 4,
        activeWaveNumber: 2,
        stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
        stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
        samplingResults: {
            simple: { completed: true, sampleCount: 60, serverGenerated: true },
            systematic: { completed: true, sampleCount: 60, interval: 3, serverGenerated: true },
        },
        wavesData: [
            {
                waveNumber: 1,
                kind: "pilot",
                label: "Wave 1",
                questionnaire: q1,
                samplePlan: plan1,
                samplingResults: { simple: { completed: true, sampleCount: 30, serverGenerated: true } },
                fieldwork: fieldworkFor(["simple"]),
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: "2026-01-02T00:00:00Z",
            },
            {
                waveNumber: 2,
                kind: "main",
                label: "Wave 2",
                questionnaire: q1,
                samplePlan: plan2,
                samplingResults: null,
                fieldwork: null,
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: null,
            },
        ],
    });
    expect(buildStageCompletionUpdates({
        experimentRecord: stage4EmptyWave2,
        stage: 4,
        payload: {},
        populationSize: 200,
        deadlinePassed: false,
    }).ok).toBe(false);

    const stage4Dispatched = record({
        currentStage: 4,
        activeWaveNumber: 2,
        stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
        stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
        wavesData: [
            {
                waveNumber: 1,
                kind: "pilot",
                label: "Wave 1",
                questionnaire: q1,
                samplePlan: plan1,
                samplingResults: { simple: { completed: true, sampleCount: 30, serverGenerated: true } },
                fieldwork: fieldworkFor(["simple"]),
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: "2026-01-02T00:00:00Z",
            },
            {
                waveNumber: 2,
                kind: "main",
                label: "Wave 2",
                questionnaire: q1,
                samplePlan: plan2,
                samplingResults: {
                    simple: { completed: true, sampleCount: 60, serverGenerated: true },
                    systematic: { completed: true, sampleCount: 60, interval: 3, serverGenerated: true },
                },
                fieldwork: fieldworkFor(["simple", "systematic"]),
                cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                completedAt: null,
            },
        ],
    });
    expect(buildStageCompletionUpdates({
        experimentRecord: stage4Dispatched,
        stage: 4,
        payload: { questionnaire: q2 },
        populationSize: 200,
        deadlinePassed: false,
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
    })).toMatchObject({ ok: false, code: "FIELDWORK_REQUIRED", status: 409 });

    expect(buildStageCompletionUpdates({
        experimentRecord: stage4Dispatched,
        stage: 4,
        payload: { samplePlan: { ...plan2, finalSampleSize: 80 } },
        populationSize: 200,
        deadlinePassed: false,
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
    })).toMatchObject({ ok: false, code: "FIELDWORK_REQUIRED", status: 409 });
});

test("reopening stage 2 or 3 after multi-wave formal stage restores Wave 1 top-level data and drops Wave 2/3", () => {
    const q1 = { ...validQuestionnaire(), title: "首轮试投问卷" };
    const q2 = { ...validQuestionnaire(), title: "二轮正式问卷" };
    const plan1 = { confidenceLevel: "95", marginOfError: 8, finalSampleSize: 30 };
    const plan2 = { confidenceLevel: "95", marginOfError: 5, finalSampleSize: 80 };
    const sr1 = { simple: { completed: true, sampleCount: 30, serverGenerated: true } };
    const sr2 = { simple: { completed: true, sampleCount: 80, serverGenerated: true }, systematic: { completed: true, sampleCount: 80, serverGenerated: true } };

    const stage5MultiWave = record({
        currentStage: 5,
        activeWaveNumber: 3,
        questionnaire: q2,
        samplePlan: plan2,
        samplingResults: sr2,
        adjustmentPlan: { identifiedIssues: ["unit_nonresponse_gap"], plannedActions: ["recalibrate_sample_size"], rationale: "调整说明理由超过十五个字。" },
        reportContent: "<p>报告</p>",
        stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
        stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
        stage4CompletedAt: new Date("2026-01-04T00:00:00Z"),
        stage5CompletedAt: new Date("2026-01-05T00:00:00Z"),
        wavesData: [
            { waveNumber: 1, kind: "pilot", label: "Wave 1", questionnaire: q1, samplePlan: plan1, samplingResults: sr1, fieldwork: fieldworkFor(["simple"]), cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true }, completedAt: "2026-01-02T00:00:00Z" },
            { waveNumber: 2, kind: "main", label: "Wave 2", questionnaire: q2, samplePlan: plan2, samplingResults: sr2, fieldwork: fieldworkFor(["simple", "systematic"]), cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true }, completedAt: "2026-01-03T12:00:00Z" },
            { waveNumber: 3, kind: "refinement", label: "Wave 3", questionnaire: q2, samplePlan: plan2, samplingResults: sr2, fieldwork: fieldworkFor(["simple", "systematic"]), cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true }, completedAt: "2026-01-04T00:00:00Z" },
        ],
    });

    for (const stage of [2, 3] as const) {
        const reopened = buildStageReopenUpdates({ experimentRecord: stage5MultiWave, stage, deadlinePassed: false });
        expect(reopened.ok).toBe(true);
        if (!reopened.ok) return;
        expect(reopened.updates.activeWaveNumber).toBe(1);
        expect(reopened.updates.questionnaire).toEqual(q1);
        expect(reopened.updates.samplePlan).toEqual(plan1);
        expect(reopened.updates.samplingResults).toEqual(sr1);
        expect((reopened.updates.wavesData as Array<{ waveNumber: number }>).map((w) => w.waveNumber)).toEqual([1]);
    }
});

test("QA-S2-03: stage 4 completion accepts any verified Wave 1 multi-method empirical variance and rejects population σ² labeled wave1_empirical", () => {
    const q = validQuestionnaire();
    const popVariance = 42.5;
    const wave1SimpleVar = 18.2;
    const wave1StratifiedVar = 29.6;
    const makeStage4Record = (samplePlan: Record<string, unknown>) => {
        const sr2 = {
            simple: { completed: true, sampleCount: 60, serverGenerated: true },
            systematic: { completed: true, sampleCount: 60, interval: 3, serverGenerated: true },
        };
        return record({
            currentStage: 4,
            activeWaveNumber: 2,
            samplePlan,
            samplingResults: sr2,
            stage2CompletedAt: new Date("2026-01-02T00:00:00Z"),
            stage3CompletedAt: new Date("2026-01-03T00:00:00Z"),
            wavesData: [
                {
                    waveNumber: 1,
                    kind: "pilot",
                    label: "Wave 1",
                    questionnaire: q,
                    samplePlan: { estimationType: "mean", confidenceLevel: "95", marginOfError: 2, populationVariance: 16, varianceSource: "prior_estimate", designEffect: 1, nonResponseRate: 0, recommendedSize: 24, finalSampleSize: 24 },
                    samplingResults: { simple: { completed: true, sampleCount: 24, serverGenerated: true }, stratified: { completed: true, sampleCount: 24, serverGenerated: true } },
                    fieldwork: fieldworkFor(["simple", "stratified"]),
                    cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                    completedAt: "2026-01-02T00:00:00Z",
                },
                {
                    waveNumber: 2,
                    kind: "main",
                    label: "Wave 2",
                    questionnaire: q,
                    samplePlan,
                    samplingResults: sr2,
                    fieldwork: fieldworkFor(["simple", "systematic"]),
                    cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
                    completedAt: null,
                },
            ],
        });
    };

    const nonFirstMethodPlan = {
        estimationType: "mean",
        confidenceLevel: "95",
        marginOfError: 1.5,
        populationVariance: wave1StratifiedVar,
        varianceSource: "wave1_empirical",
        designEffect: 1,
        nonResponseRate: 0,
        recommendedSize: calculateMeanEstimationSampleSize({
            confidenceLevel: "95",
            marginOfError: 1.5,
            populationSize: 200,
            populationVariance: wave1StratifiedVar,
            designEffect: 1,
            nonResponseRate: 0,
        })!,
        finalSampleSize: 60,
    };
    const accepted = buildStageCompletionUpdates({
        experimentRecord: makeStage4Record(nonFirstMethodPlan),
        stage: 4,
        payload: { samplePlan: nonFirstMethodPlan },
        populationSize: 200,
        deadlinePassed: false,
        fieldMapping: { numeric: ["支出"], analysisTarget: { kind: "mean", field: "支出" } },
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
        populationVariance: popVariance,
        verifiedWave1Variances: [wave1SimpleVar, wave1StratifiedVar],
    });
    expect(accepted.ok).toBe(true);

    const mismatchedPlan = {
        ...nonFirstMethodPlan,
        populationVariance: popVariance,
        varianceSource: "wave1_empirical",
        recommendedSize: calculateMeanEstimationSampleSize({
            confidenceLevel: "95",
            marginOfError: 1.5,
            populationSize: 200,
            populationVariance: popVariance,
            designEffect: 1,
            nonResponseRate: 0,
        })!,
    };
    const rejected = buildStageCompletionUpdates({
        experimentRecord: makeStage4Record(mismatchedPlan),
        stage: 4,
        payload: { samplePlan: mismatchedPlan },
        populationSize: 200,
        deadlinePassed: false,
        fieldMapping: { numeric: ["支出"], analysisTarget: { kind: "mean", field: "支出" } },
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
        populationVariance: popVariance,
        verifiedWave1Variances: [wave1SimpleVar, wave1StratifiedVar],
    });
    expect(rejected).toMatchObject({ ok: false, status: 400 });
    if (!rejected.ok) expect(rejected.message).toMatch(/首轮实测样本方差/);
});
