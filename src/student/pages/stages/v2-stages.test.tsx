import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import type { ExperimentData, ExperimentWaveView } from "@/domain/experiment/types";
import { autoBindQuestionnaireVariables, evaluateQuestionnaireBurden, type MethodFieldworkDiagnostics } from "@/domain/fieldwork";
import type { SavedAnalysisView, VariableDictionary } from "@/domain/variables/types";

const mockExperimentApi = {
    getStats: mock(async () => ({
        success: true,
        data: {
            stats: { region: { 华东: 60, 华北: 40 } },
            numericFields: ["spend", "orders"],
            ppsEligibleFields: ["orders"],
            populationNumericStats: { spend: { mean: 100, variance: 400, stdDev: 20, count: 100 } },
            stratumNumericStats: {},
        },
    })),
    saveWavePlan: mock(async () => ({ success: true, data: null as ExperimentData | null })),
    saveWaveQuestionnaire: mock(async (_taskId: number, _version: number, _q: ExperimentData["questionnaire"]) => ({ success: true, data: null as ExperimentData | null })),
    executeSampling: mock(async () => ({ success: true, data: { success: true, result: { completed: true, sampleCount: 30 } } })),
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
    submissionsApi: {
        getByTask: mock(async () => ({ success: true, data: null })),
    },
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
const { PilotWaveStage } = await import("./PilotWaveStage");
const { FieldworkDiagnosticsStage } = await import("./FieldworkDiagnosticsStage");
const { AdaptiveRefinementStage } = await import("./AdaptiveRefinementStage");
const { UnivariateWorkspace } = await import("../../components/UnivariateWorkspace");
const { AnalysisResultTable } = await import("@/components/AnalysisAppendices");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

function makeDiagnostics(overrides: Partial<MethodFieldworkDiagnostics> = {}): MethodFieldworkDiagnostics {
    return {
        method: "simple",
        invitedCount: 30,
        contactedCount: 27,
        notContactedCount: 3,
        refusedCount: 2,
        breakoffCount: 1,
        completedRawCount: 24,
        speederCount: 2,
        straightlinerCount: 1,
        cleanedValidCount: 21,
        effectiveRatePct: 70,
        empiricalNonResponseRatePct: 30,
        empiricalTargetVariance: 324,
        empiricalTargetStdDev: 18,
        totalEstimatedCost: 480,
        unitEffectiveCost: 22.8,
        stratumField: "region",
        maxStratumBiasPp: 5.2,
        strata: [
            { stratum: "华东", frameCount: 60, frameSharePct: 60, invitedCount: 18, validCount: 14, validSharePct: 66.7, responseRatePct: 77.8 },
            { stratum: "华北", frameCount: 40, frameSharePct: 40, invitedCount: 12, validCount: 7, validSharePct: 33.3, responseRatePct: 58.3 },
        ],
        burden: evaluateQuestionnaireBurden({ title: "消费调研问卷", welcomeText: "欢迎", endingText: "感谢", questions: [] }, null, null),
        populationTruth: 100,
        estimates: [
            { key: "cleaned_design", label: "质检清洗后估计", description: "有效卷", sampleSize: 21, estimate: 98.5, standardError: 3.9, halfWidth: 7.6 },
        ],
        questionDiagnostics: [
            { questionId: "q1", questionIndex: 0, title: "月均消费金额", type: "numeric", boundFields: ["spend"], answeredCount: 23, answerRatePct: 95, breakoffHereCount: 0, rangeBlockedCount: 0, warnings: [] },
        ],
        sampleAnomalies: [],
        ...overrides,
    };
}

const sampleDictionary: VariableDictionary = {
    source: "hash-1",
    revision: 1,
    variables: [
        { field: "spend", label: "月均消费金额", unit: "元", kind: "continuous", categories: [], missing: [] },
        { field: "region", label: "所属大区", unit: "", kind: "nominal", categories: [{ value: "华东", label: "华东" }, { value: "华北", label: "华北" }], missing: [] },
    ],
};

function makeWave(waveNumber: number, overrides: Partial<ExperimentWaveView> = {}): ExperimentWaveView {
    const rawQuestionnaire = {
        title: "消费调研问卷",
        welcomeText: "<p>欢迎参与本次匿名商业调研，数据仅作统计研究使用。</p>",
        endingText: "<p>感谢您的认真作答，祝您生活愉快！</p>",
        questions: Array.from({ length: 5 }, (_, idx) => ({
            id: `q${idx + 1}`,
            type: (idx === 0 ? "numeric" : "boolean") as "numeric" | "boolean",
            content: idx === 0 ? "您的月均消费金额是多少？" : `辅助问题 ${idx + 1}`,
            ...(idx === 0 ? { unit: "元", decimalPlaces: 0 } : {}),
        })),
    };
    const { questionnaire } = autoBindQuestionnaireVariables({
        questionnaire: rawQuestionnaire,
        dictionary: sampleDictionary,
        taskId: 5,
        targetField: "spend",
    });
    return {
        waveNumber,
        kind: waveNumber === 1 ? "pilot" : waveNumber === 2 ? "main" : "refinement",
        label: waveNumber === 1 ? "第 1 轮 · 首轮试投" : `第 ${waveNumber} 轮 · 正式投放`,
        questionnaire,
        samplePlan: {
            estimationType: "mean",
            confidenceLevel: "95",
            marginOfError: 3,
            populationVariance: 144,
            varianceSource: waveNumber === 1 ? "prior_estimate" : "population",
            designEffect: 1,
            nonResponseRate: 0.1,
            recommendedSize: 30,
            finalSampleSize: 30,
        },
        samplingResults: {
            simple: { completed: true, sampleCount: 30, data: [{ spend: 100 }] },
        },
        fieldwork: {
            methods: {
                simple: { method: "simple", dispatchSeed: 42, dispatchedAt: "2026-11-23T00:00:00Z", invitedCount: 30, records: [] },
            },
        },
        cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
        diagnostics: { simple: makeDiagnostics() },
        completedAt: null,
        ...overrides,
    };
}

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/5/experiment").restore;
    localStorage.clear();
    Object.values(mockExperimentApi).forEach((fn) => fn.mockClear());
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/variables")) return Response.json({ success: true, data: { dictionary: sampleDictionary } });
        if (url.endsWith("/analyses")) return Response.json({ success: true, data: { records: [], capacity: 20 } });
        return Response.json({ success: true, data: {} });
    }) as unknown as typeof fetch;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    localStorage.clear();
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

describe("Stage 2 PilotWaveStage validation & stale dispatch gate", () => {
    test("rejects 0, negative, empty, and out-of-bounds numeric inputs and blocks stale dispatch after new sampling", async () => {
        const wave1 = makeWave(1, {
            samplingResults: {
                simple: { completed: true, sampleCount: 30, data: [] },
                systematic: { completed: true, sampleCount: 30, data: [] },
            },
            // `simple` was dispatched, then `systematic` was sampled WITHOUT re-dispatching!
            diagnostics: { simple: makeDiagnostics() },
        });
        const exp: ExperimentData = {
            id: 50,
            taskId: 5,
            version: 3,
            currentStage: 2,
            activeWaveNumber: 1,
            status: "in_progress",
            questionnaire: wave1.questionnaire,
            samplePlan: wave1.samplePlan,
            samplingResults: wave1.samplingResults,
            waves: [wave1],
            reportContent: null,
            stage1CompletedAt: "2026-11-23T00:00:00Z",
            stage2CompletedAt: null,
            stage3CompletedAt: null,
            stage4CompletedAt: null,
            populationSize: 100,
            analysisTarget: { inferred: false, target: { kind: "mean", field: "spend" } },
            samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "optional", stratified: "optional" } },
        };
        mockContextValue = {
            experiment: exp,
            populationSize: 100,
            isSaving: false,
            refreshRequired: false,
            requireRefresh: () => undefined,
            updateExperiment: (next) => { mockContextValue.experiment = next; },
            reloadExperiment: async () => undefined,
            completeStage: async () => true,
        };

        const view = render(<PilotWaveStage onPrev={() => undefined} />);
        await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalled());

        // Stale dispatch must block completion and display explicit warning
        expect(view.queryByTestId("student-pilot-stale-dispatch-warning") !== null).toBe(true);
        expect((view.getByTestId("student-pilot-complete") as HTMLButtonElement).disabled).toBe(true);

        // Edge case: marginOfError = 0, empty string, negative priorStdDev, out-of-bounds finalSampleSize
        const moeInput = view.container.querySelector("#pilot-margin-error") as HTMLInputElement;
        fireEvent.change(moeInput, { target: { value: "0" } });
        expect(view.getByTestId("student-pilot-plan-error").textContent).toContain("大于 0");
        expect((view.getByTestId("student-pilot-save-plan") as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(moeInput, { target: { value: "" } });
        expect((view.getByTestId("student-pilot-save-plan") as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(moeInput, { target: { value: "3" } });
        const sdInput = view.container.querySelector("#pilot-prior-sd") as HTMLInputElement;
        fireEvent.change(sdInput, { target: { value: "-5" } });
        expect(view.getByTestId("student-pilot-plan-error").textContent).toContain("标准差");
        expect((view.getByTestId("student-pilot-save-plan") as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(sdInput, { target: { value: "12" } });
        const finalSizeInput = view.getByTestId("student-pilot-final-size") as HTMLInputElement;
        fireEvent.change(finalSizeInput, { target: { value: "999" } });
        expect(view.getByTestId("student-pilot-plan-error").textContent).toContain("整数");
        expect((view.getByTestId("student-pilot-save-plan") as HTMLButtonElement).disabled).toBe(true);
    });
});

describe("Stage 3 FieldworkDiagnosticsStage cleaning error & localStorage draft persistence", () => {
    test("persists AdjustmentPlan draft across reload and cleaning version bump, and surfaces cleaning errors", async () => {
        const wave1 = makeWave(1);
        const exp: ExperimentData = {
            id: 61,
            taskId: 5,
            version: 4,
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
            populationSize: 100,
            analysisTarget: { inferred: false, target: { kind: "mean", field: "spend" } },
        };
        mockContextValue = {
            experiment: exp,
            populationSize: 100,
            isSaving: false,
            refreshRequired: false,
            requireRefresh: () => undefined,
            updateExperiment: (next) => { mockContextValue.experiment = next; },
            reloadExperiment: async () => undefined,
            completeStage: async () => true,
        };

        const view = render(<FieldworkDiagnosticsStage onPrev={() => undefined} />);
        fireEvent.click(view.getByTestId("student-adjustment-auto-fill"));
        const rationaleInput = view.getByTestId("student-adjustment-rationale") as HTMLTextAreaElement;
        expect(rationaleInput.value.length).toBeGreaterThanOrEqual(15);
        expect((view.getByTestId("student-diagnostics-complete") as HTMLButtonElement).disabled).toBe(false);

        // Simulate cleaning API failure -> role="alert" inside card
        mockExperimentApi.updateCleaningConfig.mockResolvedValueOnce({
            success: false,
            error: { code: "SERVER_BUSY", message: "质检服务繁忙，请稍后重试" },
        } as never);
        await act(async () => {
            fireEvent.click(view.container.querySelector("#clean-speeder-switch")!);
        });
        expect(view.getByRole("alert").textContent).toContain("质检服务繁忙");

        // Simulate successful cleaning toggle bumping version 4 -> 5, then unmount + remount ("reload")
        const bumped = { ...exp, version: 5 };
        mockExperimentApi.updateCleaningConfig.mockResolvedValueOnce({ success: true, data: bumped });
        await act(async () => {
            fireEvent.click(view.container.querySelector("#clean-speeder-switch")!);
        });
        view.rerender(<FieldworkDiagnosticsStage onPrev={() => undefined} />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const savedText = rationaleInput.value;
        cleanup();

        const reloaded = render(<FieldworkDiagnosticsStage onPrev={() => undefined} />);
        expect((reloaded.getByTestId("student-adjustment-rationale") as HTMLTextAreaElement).value).toBe(savedText);
    });
});

describe("Stage 4 AdaptiveRefinementStage questionnaire sync, null s^2 import & Wave 2/3 switcher", () => {
    test("blocks completion when questionnaire has unsaved edits, handles null empirical s^2, and switches Wave 2/3", async () => {
        const wave1 = makeWave(1, {
            diagnostics: { simple: makeDiagnostics({ empiricalTargetVariance: null, empiricalTargetStdDev: null }) },
        });
        const wave2 = makeWave(2, {
            samplePlan: {
                estimationType: "mean",
                confidenceLevel: "95",
                marginOfError: 2,
                populationVariance: 400,
                varianceSource: "population",
                designEffect: 1,
                nonResponseRate: 0.2,
                recommendedSize: 40,
                finalSampleSize: 40,
            },
            samplingResults: {
                simple: { completed: true, sampleCount: 40, data: [] },
                systematic: { completed: true, sampleCount: 40, data: [] },
            },
            diagnostics: {
                simple: makeDiagnostics({ invitedCount: 40, cleanedValidCount: 34 }),
                systematic: makeDiagnostics({ method: "systematic", invitedCount: 40, cleanedValidCount: 35 }),
            },
        });
        const wave3 = makeWave(3, {
            samplePlan: wave2.samplePlan,
            samplingResults: {
                simple: { completed: true, sampleCount: 40, data: [] },
                systematic: { completed: true, sampleCount: 40, data: [] },
            },
            diagnostics: {
                simple: makeDiagnostics({ invitedCount: 40, cleanedValidCount: 36 }),
                systematic: makeDiagnostics({ method: "systematic", invitedCount: 40, cleanedValidCount: 36 }),
            },
        });

        const exp: ExperimentData = {
            id: 72,
            taskId: 5,
            version: 8,
            currentStage: 4,
            activeWaveNumber: 3,
            status: "in_progress",
            questionnaire: wave3.questionnaire,
            samplePlan: wave3.samplePlan,
            samplingResults: wave3.samplingResults,
            waves: [wave1, wave2, wave3],
            adjustmentPlan: {
                identifiedIssues: ["unit_nonresponse_gap"],
                plannedActions: ["recalibrate_sample_size"],
                rationale: "根据首轮有效率重算样本量并升级多方法对照。",
            },
            reportContent: null,
            stage1CompletedAt: "2026-11-23T00:00:00Z",
            stage2CompletedAt: "2026-11-23T00:05:00Z",
            stage3CompletedAt: "2026-11-23T00:10:00Z",
            stage4CompletedAt: null,
            populationSize: 100,
            analysisTarget: { inferred: false, target: { kind: "mean", field: "spend" } },
            samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
        };
        mockContextValue = {
            experiment: exp,
            populationSize: 100,
            isSaving: false,
            refreshRequired: false,
            requireRefresh: () => undefined,
            updateExperiment: (next) => { mockContextValue.experiment = next; },
            reloadExperiment: async () => undefined,
            completeStage: async () => true,
        };

        const view = render(<AdaptiveRefinementStage onPrev={() => undefined} />);
        await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalled());

        // Initially all methods in Wave 3 are dispatched, primary target is bound, and questionnaire is clean -> canCompleteStage4 is true
        await waitFor(() => expect((view.getByTestId("student-refinement-complete") as HTMLButtonElement).disabled).toBe(false));

        // Empirical import when Wave 1 s^2 is null falls back cleanly to population variance without NaN
        fireEvent.click(view.getByTestId("student-refinement-import-empirical"));
        expect(view.queryByTestId("student-refinement-plan-error") === null).toBe(true);

        // Switch between Wave 2 (historical) and Wave 3 (active)
        expect(view.queryByTestId("student-refinement-wave-switcher") !== null).toBe(true);
        fireEvent.click(view.getByTestId("student-refinement-switch-wave-2"));
        expect(view.queryByTestId("student-refinement-prior-wave-view") !== null).toBe(true);
        fireEvent.click(view.getByTestId("student-refinement-back-to-active-wave"));
        expect(view.queryByTestId("student-refinement-prior-wave-view") === null).toBe(true);

        // Edit questionnaire in Tab 1 (move Q2 up) WITHOUT saving -> must block Stage 4 completion!
        fireEvent.mouseDown(view.getByTestId("student-refinement-tab-questionnaire"), { button: 0 });
        const moveUpBtn = await waitFor(() => view.getByRole("button", { name: "上移第 2 题" }));
        fireEvent.click(moveUpBtn);
        expect((view.getByTestId("student-refinement-complete") as HTMLButtonElement).disabled).toBe(true);

        fireEvent.mouseDown(view.getByTestId("student-refinement-tab-sampling"), { button: 0 });
        await waitFor(() => expect(view.queryByTestId("student-refinement-unsaved-questionnaire-warning") !== null).toBe(true));
        expect((view.getByTestId("student-refinement-dispatch") as HTMLButtonElement).disabled).toBe(true);

        // Saving questionnaire when PostgreSQL jsonb reorders object keys must clear dirty state!
        mockExperimentApi.saveWaveQuestionnaire.mockImplementationOnce(async (_taskId: number, _version: number, q: ExperimentData["questionnaire"]) => {
            const reorderedQ = {
                questions: (q?.questions ?? []).map((item) => ({
                    content: item.content,
                    type: item.type,
                    id: item.id,
                    ...(item.unit ? { decimalPlaces: item.decimalPlaces, unit: item.unit } : {}),
                    ...(item.variableBinding ? {
                        variableBinding: {
                            signature: item.variableBinding.signature,
                            mappings: item.variableBinding.mappings.map((m) => ({ answers: m.answers, field: m.field })),
                            revision: item.variableBinding.revision,
                            source: item.variableBinding.source,
                            taskId: item.variableBinding.taskId,
                        },
                    } : {}),
                })),
                endingText: q?.endingText ?? "",
                title: q?.title ?? "",
                welcomeText: q?.welcomeText ?? "",
            };
            const nextExp: ExperimentData = {
                ...exp,
                version: 9,
                questionnaire: reorderedQ as ExperimentData["questionnaire"],
                waves: [wave1, wave2, { ...wave3, questionnaire: reorderedQ as ExperimentWaveView["questionnaire"], diagnostics: {} }],
            };
            return { success: true, data: nextExp };
        });
        fireEvent.mouseDown(view.getByTestId("student-refinement-tab-questionnaire"), { button: 0 });
        const saveQBtn = await waitFor(() => view.getByTestId("student-refinement-save-questionnaire") as HTMLButtonElement);
        await waitFor(() => expect(saveQBtn.disabled).toBe(false));
        await act(async () => {
            fireEvent.click(saveQBtn);
        });
        view.rerender(<AdaptiveRefinementStage onPrev={() => undefined} />);
        fireEvent.mouseDown(view.getByTestId("student-refinement-tab-sampling"), { button: 0 });
        await waitFor(() => expect(view.queryByTestId("student-refinement-unsaved-questionnaire-warning") === null).toBe(true));
    });

    test("blocks Stage 4 completion and formal dispatch when primary target variable is unbound until auto-bound", async () => {
        const unboundQuestionnaire = {
            title: "未绑定主指标问卷",
            welcomeText: "<p>欢迎参与本次匿名商业调研，数据仅作统计研究使用。</p>",
            endingText: "<p>感谢您的认真作答，祝您生活愉快！</p>",
            questions: Array.from({ length: 5 }, (_, idx) => ({
                id: `u${idx + 1}`,
                type: (idx === 0 ? "numeric" : "boolean") as "numeric" | "boolean",
                content: idx === 0 ? "您的月均消费金额是多少？" : `辅助问题 ${idx + 1}`,
                ...(idx === 0 ? { unit: "元", decimalPlaces: 0 } : {}),
            })),
        };
        const wave1 = makeWave(1);
        const wave2 = makeWave(2, {
            questionnaire: unboundQuestionnaire,
            samplingResults: {
                simple: { completed: true, sampleCount: 30, data: [] },
                systematic: { completed: true, sampleCount: 30, data: [] },
            },
            diagnostics: {
                simple: makeDiagnostics({ invitedCount: 30, cleanedValidCount: 25 }),
                systematic: makeDiagnostics({ method: "systematic", invitedCount: 30, cleanedValidCount: 26 }),
            },
        });
        const exp: ExperimentData = {
            id: 79,
            taskId: 5,
            version: 4,
            currentStage: 4,
            activeWaveNumber: 2,
            status: "in_progress",
            questionnaire: unboundQuestionnaire,
            samplePlan: wave2.samplePlan,
            samplingResults: wave2.samplingResults,
            waves: [wave1, wave2],
            adjustmentPlan: {
                identifiedIssues: ["unmeasured_variables"],
                plannedActions: ["revise_questionnaire"],
                rationale: "补齐核心商业指标测量绑定后再投放。",
            },
            reportContent: null,
            stage1CompletedAt: "2026-11-23T00:00:00Z",
            stage2CompletedAt: "2026-11-23T00:05:00Z",
            stage3CompletedAt: "2026-11-23T00:10:00Z",
            stage4CompletedAt: null,
            populationSize: 100,
            analysisTarget: { inferred: false, target: { kind: "mean", field: "spend" } },
            samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" } },
        };
        mockContextValue = {
            experiment: exp,
            populationSize: 100,
            isSaving: false,
            refreshRequired: false,
            requireRefresh: () => undefined,
            updateExperiment: (next) => { mockContextValue.experiment = next; },
            reloadExperiment: async () => undefined,
            completeStage: async () => true,
        };

        const view = render(<AdaptiveRefinementStage onPrev={() => undefined} />);
        await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalled());
        await waitFor(() => expect((view.getByTestId("student-refinement-complete") as HTMLButtonElement).disabled).toBe(true));

        fireEvent.mouseDown(view.getByTestId("student-refinement-tab-sampling"), { button: 0 });
        await waitFor(() => expect(view.queryByTestId("student-refinement-unbound-target-warning") !== null).toBe(true));
        expect((view.getByTestId("student-refinement-dispatch") as HTMLButtonElement).disabled).toBe(true);

        // Jump to questionnaire tab via warning CTA and auto-bind variables
        fireEvent.click(view.getByRole("button", { name: "前往关联主指标" }));
        const autoBindBtn = await waitFor(() => view.getByRole("button", { name: "一键智能绑定变量" }));
        fireEvent.click(autoBindBtn);
        expect((view.getByTestId("student-refinement-save-questionnaire") as HTMLButtonElement).disabled).toBe(false);
    });
});

describe("Stage 5 UnivariateWorkspace wave-method reconciliation & empty crosstab table", () => {
    test("reconciles selected method to Wave 1 completed methods when switching waves, and renders empty crosstab notice", async () => {
        const wave1 = makeWave(1, {
            samplingResults: { simple: { completed: true, sampleCount: 30 } },
        });
        const wave2 = makeWave(2, {
            samplingResults: {
                simple: { completed: true, sampleCount: 50 },
                stratified: { completed: true, stratifyBy: "region", layers: [], sampleCount: 50 },
            },
        });

        const view = render(
            <MemoryRouter>
                <Routes>
                    <Route
                        path="*"
                        element={
                            <UnivariateWorkspace
                                taskId={5}
                                observedVersion={9}
                                completedMethods={["stratified", "simple"]}
                                waves={[wave1, wave2]}
                                activeWaveNumber={2}
                                references={[]}
                                refreshRequired={false}
                                onReferencesChange={() => undefined}
                                onRefreshRequired={() => undefined}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => expect(view.queryByRole("combobox", { name: "选择分析波次" }) !== null).toBe(true));
        expect(view.getByRole("combobox", { name: "选择抽样方法来源" }).textContent).toContain("分层抽样");

        // Switch wave from Wave 2 to Wave 1 (where only `simple` was executed)
        fireEvent.keyDown(view.getByRole("combobox", { name: "选择分析波次" }), { key: "ArrowDown" });
        const wave1Option = await waitFor(() => view.getByRole("option", { name: "第 1 轮 · 首轮试投" }));
        fireEvent.keyDown(wave1Option, { key: "Enter" });

        await waitFor(() => {
            expect(view.getByRole("combobox", { name: "选择抽样方法来源" }).textContent).toContain("简单随机抽样");
        });

        // Empty crosstab groups render informative empty row
        const emptyRecord: SavedAnalysisView = {
            id: 1,
            waveNumber: 2,
            config: { question: "分组为空测试", method: "simple", field: "spend", groupByField: "region", weighted: false },
            variable: sampleDictionary.variables[0]!,
            result: {
                kind: "crosstab",
                targetKind: "numeric",
                groupField: "region",
                groupLabel: "所属大区",
                sampleCount: 10,
                validCount: 0,
                missingCount: 10,
                weighted: false,
                groups: [],
            },
            source: "hash-1",
            dictionaryRevision: 1,
            samplingGeneration: 1,
            algorithmVersion: "v2",
            createdAt: "2026-11-23T00:00:00Z",
            stale: false,
        };
        const tableView = render(<AnalysisResultTable record={emptyRecord} />);
        expect(tableView.queryByText(/暂无有效交叉样本记录/) !== null).toBe(true);
    });
});
