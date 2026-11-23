import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { ExperimentData, ExperimentWaveView } from "@/domain/experiment/types";
import { autoBindQuestionnaireVariables, evaluateQuestionnaireBurden, type MethodFieldworkDiagnostics } from "@/domain/fieldwork";
import type { VariableDictionary } from "@/domain/variables/types";

const mockExperimentApi = {
    updateCleaningConfig: mock(async () => ({ success: true, data: null as ExperimentData | null })),
};

let mockContextValue: {
    experiment: ExperimentData | null;
    populationSize: number;
    isSaving: boolean;
    refreshRequired: boolean;
    requireRefresh: () => void;
    updateExperiment: (next: ExperimentData) => void;
    reloadExperiment: () => Promise<void>;
    completeStage: (stage: number, data: Record<string, unknown>) => Promise<boolean>;
};

mock.module("../ExperimentLayout", () => ({
    useExperiment: () => mockContextValue,
}));

mock.module("../../api-client", () => ({
    experimentApi: mockExperimentApi,
}));

mock.module("sonner", () => ({
    toast: {
        success: mock(() => undefined),
        error: mock(() => undefined),
        info: mock(() => undefined),
    },
}));

const bootstrapDom = installDomGlobals("http://localhost/student");
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { FieldworkDiagnosticsStage } = await import("./FieldworkDiagnosticsStage");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

const saasDict: VariableDictionary = {
    source: "saas-hash",
    revision: 1,
    variables: [
        { field: "年度增购预算", label: "年度增购预算", unit: "万元", kind: "continuous", categories: [], missing: [] },
        { field: "所属行业", label: "所属行业", unit: "", kind: "nominal", categories: [{ value: "智能制造", label: "智能制造" }], missing: [] },
    ],
};

function makeSaasWave1(): ExperimentWaveView {
    const rawQ = {
        title: "B2B SaaS预算调研",
        welcomeText: "<p>欢迎参与年度SaaS预算规划调研，数据严格保密。</p>",
        endingText: "<p>感谢贵司支持与配合，祝商祺！</p>",
        questions: Array.from({ length: 5 }, (_, i) => ({
            id: `sq${i + 1}`,
            type: (i === 0 ? "numeric" : "boolean") as "numeric" | "boolean",
            content: i === 0 ? "下一财年年度增购预算是多少万元？" : `辅助问题 ${i + 1}`,
            ...(i === 0 ? { unit: "万元", decimalPlaces: 0 } : {}),
        })),
    };
    const { questionnaire } = autoBindQuestionnaireVariables({
        questionnaire: rawQ,
        dictionary: saasDict,
        taskId: 3,
        targetField: "年度增购预算",
    });
    const diag: MethodFieldworkDiagnostics = {
        method: "simple",
        invitedCount: 12,
        contactedCount: 12,
        notContactedCount: 0,
        refusedCount: 0,
        breakoffCount: 0,
        completedRawCount: 12,
        speederCount: 1,
        straightlinerCount: 2,
        cleanedValidCount: 9,
        effectiveRatePct: 75,
        empiricalNonResponseRatePct: 25,
        empiricalTargetVariance: 238.28,
        empiricalTargetStdDev: 15.44,
        totalEstimatedCost: 2220,
        unitEffectiveCost: 246.7,
        stratumField: "所属行业",
        maxStratumBiasPp: 12.5,
        strata: [
            { stratum: "智能制造", frameCount: 16, frameSharePct: 50, invitedCount: 6, validCount: 5, validSharePct: 55.6, responseRatePct: 83.3 },
            { stratum: "现代物流", frameCount: 16, frameSharePct: 50, invitedCount: 6, validCount: 4, validSharePct: 44.4, responseRatePct: 66.7 },
        ],
        burden: evaluateQuestionnaireBurden(questionnaire, saasDict, { kind: "mean", field: "年度增购预算" }),
        populationTruth: 28.38,
        estimates: [
            { key: "cleaned_design", label: "质检清洗后估计", description: "有效卷", sampleSize: 9, estimate: 27.56, standardError: 4.36, halfWidth: 8.55 },
        ],
        questionDiagnostics: [],
        sampleAnomalies: [],
    };
    return {
        waveNumber: 1,
        kind: "pilot",
        label: "第 1 轮 · 首轮试投",
        questionnaire,
        samplePlan: {
            estimationType: "mean",
            confidenceLevel: "95",
            marginOfError: 10,
            populationVariance: 225,
            varianceSource: "prior_estimate",
            designEffect: 1,
            nonResponseRate: 0.1,
            recommendedSize: 12,
            finalSampleSize: 12,
        },
        samplingResults: { simple: { completed: true, sampleCount: 12 } },
        fieldwork: null,
        cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
        diagnostics: { simple: diag },
        completedAt: null,
    };
}

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/3/experiment").restore;
    localStorage.clear();
    globalThis.fetch = mock(async () => Response.json({ success: true, data: { dictionary: saasDict } })) as unknown as typeof fetch;
});

afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 0));
    localStorage.clear();
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

describe("Stage 3 FieldworkDiagnosticsStage unit formatting & blocker feedback", () => {
    test("displays inferred target unit (万元), CI [lo, hi] bounds, and sticky CTA blocker hints until valid", () => {
        const wave1 = makeSaasWave1();
        mockContextValue = {
            experiment: {
                id: 301,
                taskId: 3,
                version: 2,
                currentStage: 3,
                activeWaveNumber: 1,
                status: "in_progress",
                questionnaire: wave1.questionnaire,
                samplePlan: wave1.samplePlan,
                samplingResults: wave1.samplingResults,
                waves: [wave1],
                adjustmentPlan: null,
                reportContent: null,
                stage1CompletedAt: "2026-11-23T00:00:00Z",
                stage2CompletedAt: "2026-11-23T00:05:00Z",
                stage3CompletedAt: null,
                stage4CompletedAt: null,
                populationSize: 32,
                analysisTarget: { inferred: false, target: { kind: "mean", field: "年度增购预算" } },
            },
            populationSize: 32,
            isSaving: false,
            refreshRequired: false,
            requireRefresh: () => undefined,
            updateExperiment: () => undefined,
            reloadExperiment: async () => undefined,
            completeStage: async () => true,
        };

        const view = render(<FieldworkDiagnosticsStage onPrev={() => undefined} />);

        // KPI stdDev and CI forest plot show 万元 unit + ±halfWidth + [lo, hi] bounds without stray characters
        expect(view.queryByText("15.44 万元") !== null).toBe(true);
        const ciPlot = view.getByTestId("confidence-interval-plot");
        expect(ciPlot.textContent).toContain("27.56万元");
        expect(ciPlot.textContent).toContain("±8.55万元");
        expect(ciPlot.textContent).toContain("[19.01, 36.11]万元");

        // Before filling AdjustmentPlan, sticky CTA is disabled and explains why
        expect((view.getByTestId("student-diagnostics-complete") as HTMLButtonElement).disabled).toBe(true);
        expect(view.getByTestId("student-diagnostics-blocker-hint").textContent).toContain("至少勾选 1 项");

        // Partial manual input (< 15 chars) updates character countdown and blocker message
        fireEvent.click(view.getByTestId("student-adjustment-issue-unit_nonresponse_gap"));
        fireEvent.click(view.getByTestId("student-adjustment-action-recalibrate_sample_size"));
        fireEvent.change(view.getByTestId("student-adjustment-rationale"), { target: { value: "太短说明" } });
        expect(view.container.textContent).toContain("还差 11 字达标");
        expect((view.getByTestId("student-diagnostics-complete") as HTMLButtonElement).disabled).toBe(true);

        // Auto-extract fills valid >= 15 char rationale including unit and clears blocker
        fireEvent.change(view.getByTestId("student-adjustment-rationale"), { target: { value: "" } });
        fireEvent.click(view.getByTestId("student-adjustment-auto-fill"));
        expect((view.getByTestId("student-adjustment-rationale") as HTMLTextAreaElement).value).toContain("15.44万元");
        expect(view.queryByTestId("student-diagnostics-blocker-hint") === null).toBe(true);
        expect((view.getByTestId("student-diagnostics-complete") as HTMLButtonElement).disabled).toBe(false);
    });
});
