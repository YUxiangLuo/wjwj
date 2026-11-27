import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { ExperimentData, ExperimentWaveView } from "@/domain/experiment/types";
import { autoBindQuestionnaireVariables, evaluateQuestionnaireBurden, type MethodFieldworkDiagnostics } from "@/domain/fieldwork";
import type { VariableDictionary } from "@/domain/variables/types";

const mockExperimentApi = {
    getStats: mock(async () => ({
        success: true,
        data: {
            stats: { active_tier: { 高频: 100, 低频: 100 } },
            numericFields: [],
            ppsEligibleFields: [],
            populationNumericStats: {},
            stratumNumericStats: {},
        },
    })),
    saveWavePlan: mock(async () => ({ success: true, data: null as ExperimentData | null })),
    saveWaveQuestionnaire: mock(async () => ({ success: true, data: null as ExperimentData | null })),
    executeSampling: mock(async () => ({ success: true, data: { success: true, result: { completed: true, sampleCount: 80 } } })),
    dispatchFieldwork: mock(async () => ({ success: true, data: null as ExperimentData | null })),
    updateCleaningConfig: mock(async () => ({ success: true, data: null as ExperimentData | null })),
    createRefinementWave: mock(async () => ({ success: true, data: null as ExperimentData | null })),
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
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { AdaptiveRefinementStage } = await import("./AdaptiveRefinementStage");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

const vipDict: VariableDictionary = {
    source: "vip-hash",
    revision: 1,
    variables: [
        { field: "续费意向", label: "续费意向", unit: "", kind: "ordinal", categories: [{ value: "明确续费", label: "明确续费" }, { value: "暂不续费", label: "暂不续费" }], missing: [] },
        { field: "active_tier", label: "活跃分层", unit: "", kind: "ordinal", categories: [{ value: "高频", label: "高频" }, { value: "低频", label: "低频" }], missing: [] },
    ],
};

function makeVipDiag(method: "simple" | "stratified" = "simple"): MethodFieldworkDiagnostics {
    return {
        method,
        invitedCount: 35,
        contactedCount: 31,
        notContactedCount: 4,
        refusedCount: 2,
        breakoffCount: 0,
        completedRawCount: 29,
        speederCount: 1,
        straightlinerCount: 1,
        cleanedValidCount: 27,
        effectiveRatePct: 77.1,
        empiricalNonResponseRatePct: 23,
        empiricalTargetVariance: null,
        empiricalTargetStdDev: null,
        totalEstimatedCost: 555,
        unitEffectiveCost: 20.6,
        stratumField: "active_tier",
        maxStratumBiasPp: 8.3,
        strata: [],
        burden: evaluateQuestionnaireBurden({ title: "续费调研", welcomeText: "欢迎", endingText: "感谢", questions: [] }, null, null),
        populationTruth: 0.44,
        estimates: [
            { key: "cleaned_design", label: "质检清洗后估计", description: "有效卷", sampleSize: 27, estimate: 0.48, standardError: 0.089, halfWidth: 0.175 },
        ],
        questionDiagnostics: [],
        sampleAnomalies: [],
    };
}

function makeVipWave(waveNumber: number, overrides: Partial<ExperimentWaveView> = {}): ExperimentWaveView {
    const rawQ = {
        title: "电商付费会员续费意向调研",
        welcomeText: "<p>您好！感谢参与平台付费会员年度续费意向与权益调研。</p>",
        endingText: "<p>感谢您的真实反馈，我们将持续优化会员权益包！</p>",
        questions: Array.from({ length: 5 }, (_, idx) => ({
            id: `vq${idx + 1}`,
            type: (idx === 0 ? "single" : "boolean") as "single" | "boolean",
            content: idx === 0 ? "您的年度续费意向是什么？" : `辅助问题 ${idx + 1}`,
            ...(idx === 0 ? { options: ["明确续费", "暂不续费"] } : {}),
        })),
    };
    const { questionnaire } = autoBindQuestionnaireVariables({
        questionnaire: rawQ,
        dictionary: vipDict,
        taskId: 4,
        targetField: "续费意向",
    });
    return {
        waveNumber,
        kind: waveNumber === 1 ? "pilot" : waveNumber === 2 ? "main" : "refinement",
        label: waveNumber === 1 ? "第 1 轮 · 首轮试投" : `第 ${waveNumber} 轮 · 正式投放`,
        questionnaire,
        samplePlan: {
            estimationType: "proportion",
            confidenceLevel: "95",
            marginOfError: 10,
            designEffect: 1,
            nonResponseRate: 0.1,
            recommendedSize: 35,
            finalSampleSize: 35,
        },
        samplingResults: null,
        fieldwork: null,
        cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
        diagnostics: {},
        completedAt: null,
        ...overrides,
    };
}

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/4/experiment").restore;
    localStorage.clear();
    Object.values(mockExperimentApi).forEach((fn) => fn.mockClear());
    globalThis.fetch = mock(async () => Response.json({ success: true, data: { dictionary: vipDict } })) as unknown as typeof fetch;
});

afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 0));
    localStorage.clear();
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

describe("Stage 4 AdaptiveRefinementStage step-flow, proportion validation & dispatch policy gates", () => {
    test("opens Step 1 when revise_questionnaire was planned, supports 1-click skip to Step 2, flags inherited pilot plan & enforces 1-10% proportion margin", async () => {
        const wave1 = makeVipWave(1, {
            samplingResults: { simple: { completed: true, sampleCount: 35 } },
            diagnostics: { simple: makeVipDiag("simple") },
        });
        const wave2 = makeVipWave(2);
        const exp: ExperimentData = {
            id: 401,
            taskId: 4,
            version: 4,
            currentStage: 4,
            activeWaveNumber: 2,
            status: "in_progress",
            questionnaire: wave2.questionnaire,
            samplePlan: wave2.samplePlan,
            samplingResults: null,
            waves: [wave1, wave2],
            adjustmentPlan: {
                identifiedIssues: ["stratum_response_bias"],
                plannedActions: ["revise_questionnaire", "recalibrate_sample_size", "upgrade_sampling_design"],
                rationale: "首轮沉默会员欠代表，拟核对问卷后重算样本量并升级分层抽样。",
            },
            reportContent: null,
            stage1CompletedAt: "2026-11-23T00:00:00Z",
            stage2CompletedAt: "2026-11-23T00:05:00Z",
            stage3CompletedAt: "2026-11-23T00:10:00Z",
            stage4CompletedAt: null,
            populationSize: 200,
            analysisTarget: { inferred: false, target: { kind: "proportion", field: "续费意向", value: "明确续费" } },
            samplingPolicy: { version: 1, methods: { simple: "required", stratified: "required", systematic: "optional", pps: "disabled" } },
        };
        mockContextValue = {
            experiment: exp,
            populationSize: 200,
            isSaving: false,
            refreshRequired: false,
            requireRefresh: () => undefined,
            updateExperiment: (next) => { mockContextValue.experiment = next; },
            reloadExperiment: async () => undefined,
            completeStage: async () => true,
        };

        const view = render(<AdaptiveRefinementStage onPrev={() => undefined} />);
        await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalled());

        // Step 1 opens with prominent "无需改卷，进入实测样本量重算" CTA
        const skipBtn = view.getByTestId("student-refinement-skip-questionnaire");
        expect(skipBtn.textContent).toContain("无需改卷");
        fireEvent.click(skipBtn);

        // Step 2 displays pilot inheritance notice instead of premature green checkmark
        await waitFor(() => expect(view.queryByTestId("student-refinement-pilot-plan-notice") !== null).toBe(true));
        expect(view.getByTestId("student-refinement-tab-plan").textContent).toContain("待确认");

        // Proportion marginOfError > 10 is rejected client-side (matching server 1%-10% rule)
        const moeInput = view.container.querySelector("#formal-margin-error") as HTMLInputElement;
        fireEvent.change(moeInput, { target: { value: "12" } });
        expect(view.getByTestId("student-refinement-plan-error").textContent).toContain("1%–10%");
        expect((view.getByTestId("student-refinement-save-plan") as HTMLButtonElement).disabled).toBe(true);

        // Tightening marginOfError to 5 without saving warns in Step 3 about unsaved plan changes
        fireEvent.change(moeInput, { target: { value: "5" } });
        fireEvent.mouseDown(view.getByTestId("student-refinement-tab-sampling"), { button: 0 });
        await waitFor(() => expect(view.queryByTestId("student-refinement-unsaved-plan-warning") !== null).toBe(true));
    });

    test("disables formal dispatch until sampling policy is met and shows clean onboarding on Wave 3 creation", async () => {
        const wave1 = makeVipWave(1, {
            samplingResults: { simple: { completed: true, sampleCount: 35 } },
            diagnostics: { simple: makeVipDiag("simple") },
        });
        // Only `simple` completed so far while `stratified` is required!
        const partialWave2 = makeVipWave(2, {
            samplePlan: {
                estimationType: "proportion",
                confidenceLevel: "95",
                marginOfError: 5,
                designEffect: 1,
                nonResponseRate: 0.23,
                recommendedSize: 172,
                finalSampleSize: 172,
            },
            samplingResults: {
                simple: { completed: true, sampleCount: 172, data: [] },
            },
        });
        const exp: ExperimentData = {
            id: 402,
            taskId: 4,
            version: 6,
            currentStage: 4,
            activeWaveNumber: 2,
            status: "in_progress",
            questionnaire: partialWave2.questionnaire,
            samplePlan: partialWave2.samplePlan,
            samplingResults: partialWave2.samplingResults,
            waves: [wave1, partialWave2],
            adjustmentPlan: {
                identifiedIssues: ["stratum_response_bias"],
                plannedActions: ["recalibrate_sample_size", "upgrade_sampling_design"],
                rationale: "代入实测无回答率并升级分层抽样。",
            },
            reportContent: null,
            stage1CompletedAt: "2026-11-23T00:00:00Z",
            stage2CompletedAt: "2026-11-23T00:05:00Z",
            stage3CompletedAt: "2026-11-23T00:10:00Z",
            stage4CompletedAt: null,
            populationSize: 200,
            analysisTarget: { inferred: false, target: { kind: "proportion", field: "续费意向", value: "明确续费" } },
            samplingPolicy: { version: 1, methods: { simple: "required", stratified: "required", systematic: "optional", pps: "disabled" } },
        };
        mockContextValue = {
            experiment: exp,
            populationSize: 200,
            isSaving: false,
            refreshRequired: false,
            requireRefresh: () => undefined,
            updateExperiment: (next) => { mockContextValue.experiment = next; },
            reloadExperiment: async () => undefined,
            completeStage: async () => true,
        };

        const view = render(<AdaptiveRefinementStage onPrev={() => undefined} />);
        await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalled());

        fireEvent.mouseDown(view.getByTestId("student-refinement-tab-sampling"), { button: 0 });
        await waitFor(() => expect((view.getByTestId("student-refinement-dispatch") as HTMLButtonElement).disabled).toBe(true));
        expect(view.getByTestId("student-refinement-dispatch-policy-hint").textContent).toContain("分层抽样");
        expect(view.getByTestId("student-refinement-blocker-hint").textContent).toContain("分层抽样");

        // Simulate Wave 2 completed + Wave 3 newly created (undispatched)
        const completedWave2: ExperimentWaveView = {
            ...partialWave2,
            samplingResults: {
                simple: { completed: true, sampleCount: 172, data: [] },
                stratified: { completed: true, stratifyBy: "active_tier", layers: [], sampleCount: 172, data: [] },
            },
            diagnostics: {
                simple: makeVipDiag("simple"),
                stratified: makeVipDiag("stratified"),
            },
        };
        const freshWave3 = makeVipWave(3, { samplePlan: completedWave2.samplePlan });
        const wave3Exp: ExperimentData = {
            ...exp,
            version: 8,
            activeWaveNumber: 3,
            waves: [wave1, completedWave2, freshWave3],
            samplingResults: null,
        };
        mockContextValue.experiment = {
            ...exp,
            version: 7,
            waves: [wave1, completedWave2],
            samplingResults: completedWave2.samplingResults,
        };
        view.rerender(<AdaptiveRefinementStage onPrev={() => undefined} />);
        await waitFor(() => expect(view.queryByTestId("student-refinement-new-wave") !== null).toBe(true));
        expect(view.getByTestId("student-refinement-new-wave").getAttribute("data-variant")).toBe("outline");
        expect(view.getByTestId("student-refinement-dispatch").getAttribute("data-variant")).toBe("outline");
        expect(view.getByTestId("student-refinement-complete").getAttribute("data-variant")).toBe("default");
        expect(view.container.querySelectorAll('[data-slot="button"][data-variant="default"]').length).toBe(1);

        mockExperimentApi.createRefinementWave.mockResolvedValueOnce({ success: true, data: wave3Exp });
        await act(async () => {
            fireEvent.click(view.getByTestId("student-refinement-new-wave"));
        });
        view.rerender(<AdaptiveRefinementStage onPrev={() => undefined} />);

        // Undispatched Wave 3 shows onboarding instead of stale Wave 2 scorecard, while historical Wave 2 view shows WaveDeltaScorecard
        expect(view.queryByTestId("student-refinement-wave3-onboarding") !== null).toBe(true);
        expect(view.queryByTestId("wave-delta-scorecard") === null).toBe(true);
        fireEvent.click(view.getByTestId("student-refinement-switch-wave-2"));
        expect(view.queryByTestId("student-refinement-prior-wave-view") !== null).toBe(true);
        expect(view.queryByTestId("wave-delta-scorecard") !== null).toBe(true);
    });
});
