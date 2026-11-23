import { afterEach, beforeEach, expect, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { ExperimentWaveView } from "@/domain/experiment/types";
import {
    DEFAULT_CLEANING_CONFIG,
    evaluateQuestionnaireBurden,
    type AdjustmentPlan,
    type MethodFieldworkDiagnostics,
} from "@/domain/fieldwork";

const bootstrapDom = installDomGlobals("http://localhost/student");
const { cleanup, render } = await import("@testing-library/react");
const { WaveLoopSnapshot, buildWaveSnapshotMetric } = await import("./WaveLoopSnapshot");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

function makeDiagnostics(overrides: Partial<MethodFieldworkDiagnostics> = {}): MethodFieldworkDiagnostics {
    return {
        method: "simple",
        invitedCount: 40,
        contactedCount: 36,
        notContactedCount: 4,
        refusedCount: 6,
        breakoffCount: 2,
        completedRawCount: 28,
        speederCount: 2,
        straightlinerCount: 1,
        cleanedValidCount: 25,
        effectiveRatePct: 62.5,
        empiricalNonResponseRatePct: 37.5,
        empiricalTargetVariance: 18.4,
        empiricalTargetStdDev: Math.sqrt(18.4),
        totalEstimatedCost: 380,
        unitEffectiveCost: 15.2,
        stratumField: "会员等级",
        strata: [
            {
                stratum: "普通会员",
                frameCount: 96,
                frameSharePct: 40,
                invitedCount: 16,
                validCount: 7,
                validSharePct: 28,
                responseRatePct: 43.75,
            },
            {
                stratum: "黑金会员",
                frameCount: 60,
                frameSharePct: 25,
                invitedCount: 10,
                validCount: 9,
                validSharePct: 36,
                responseRatePct: 90,
            },
        ],
        maxStratumBiasPp: 12,
        questionDiagnostics: [],
        burden: evaluateQuestionnaireBurden(
            { title: "测试", welcomeText: "欢迎参与匿名调研，预计3分钟。", endingText: "感谢参与。", questions: [] },
            null,
            null,
        ),
        populationTruth: 19.5,
        estimates: [
            {
                key: "uncleaned_raw",
                label: "未清洗回收直算",
                description: "含闪电卷与直线卷",
                sampleSize: 28,
                estimate: 21.8,
                standardError: 0.92,
                halfWidth: 1.8,
            },
            {
                key: "cleaned_design",
                label: "质检有效样本设计估计",
                description: "剔除无效卷后按抽样设计估计",
                sampleSize: 25,
                estimate: 20.4,
                standardError: 0.78,
                halfWidth: 1.53,
            },
            {
                key: "nonresponse_calibrated",
                label: "事后分层无回答权重校准",
                description: "按抽样框会员等级占比校准",
                sampleSize: 25,
                estimate: 19.6,
                standardError: 0.74,
                halfWidth: 1.45,
            },
        ],
        sampleAnomalies: [],
        ...overrides,
    };
}

function makeWave(waveNumber: number, kind: "pilot" | "main", diag: MethodFieldworkDiagnostics): ExperimentWaveView {
    return {
        waveNumber,
        kind,
        label: waveNumber === 1 ? "第 1 轮 · 首轮试投" : "第 2 轮 · 调优正式投放",
        questionnaire: {
            title: "茶饮新品定价调研",
            welcomeText: "欢迎参与本次匿名定价调研，预计耗时3分钟。",
            endingText: "感谢您的宝贵反馈，祝您生活愉快。",
            questions: [],
        },
        samplePlan: {
            estimationType: "mean",
            confidenceLevel: "95",
            marginOfError: 1.5,
            designEffect: 1,
            nonResponseRate: waveNumber === 1 ? 0.15 : 0.35,
            recommendedSize: waveNumber === 1 ? 40 : 90,
            finalSampleSize: waveNumber === 1 ? 40 : 90,
        },
        samplingResults: {
            [diag.method]: { completed: true, sampleCount: diag.invitedCount },
        },
        fieldwork: null,
        cleaningConfig: { ...DEFAULT_CLEANING_CONFIG },
        diagnostics: { [diag.method]: diag },
        completedAt: "2026-10-01T00:00:00.000Z",
    };
}

test("WaveLoopSnapshot renders multi-wave delta scorecard, adjustment plan, funnel, CI forest plot and stratum bias chart", () => {
    const wave1 = makeWave(1, "pilot", makeDiagnostics({ method: "simple" }));
    const wave2 = makeWave(2, "main", makeDiagnostics({
        method: "stratified",
        invitedCount: 90,
        contactedCount: 82,
        notContactedCount: 8,
        completedRawCount: 72,
        cleanedValidCount: 68,
        effectiveRatePct: 75.56,
        maxStratumBiasPp: 2.1,
        estimates: [
            {
                key: "cleaned_design",
                label: "质检有效样本设计估计",
                description: "二轮分层抽样清洗后估计",
                sampleSize: 68,
                estimate: 19.55,
                standardError: 0.41,
                halfWidth: 0.8,
            },
        ],
    }));

    const adjustmentPlan: AdjustmentPlan = {
        identifiedIssues: ["unit_nonresponse_gap", "stratum_response_bias"],
        plannedActions: ["recalibrate_sample_size", "upgrade_sampling_design"],
        rationale: "首轮试投发现普通会员拒访率偏高且有效样本不足，二轮代入实测有效率重算样本量并升级为会员等级分层抽样。",
        updatedAt: "2026-10-01T01:00:00.000Z",
    };

    const metric = buildWaveSnapshotMetric(wave2, undefined, "元");
    expect(metric).toMatchObject({
        waveNumber: 2,
        methodLabel: "分层抽样",
        invitedCount: 90,
        validCount: 68,
        maxStratumBiasPp: 2.1,
        primaryStandardError: 0.41,
    });

    const view = render(
        <WaveLoopSnapshot
            waves={[wave1, wave2]}
            adjustmentPlan={adjustmentPlan}
            analysisTarget={{ target: { kind: "mean", field: "最高支付意愿" }, inferred: false }}
            unitLabel="元"
        />,
    );

    expect(view.getByTestId("wave-loop-snapshot")).toBeTruthy();
    expect(view.getByTestId("wave-delta-scorecard")).toBeTruthy();
    expect(view.getByTestId("fieldwork-funnel-chart")).toBeTruthy();
    expect(view.getByTestId("confidence-interval-plot")).toBeTruthy();
    expect(view.getByTestId("stratum-comparison-chart")).toBeTruthy();
    expect(view.getByText(/首轮试投发现普通会员拒访率偏高/)).toBeTruthy();
});
