import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { ExperimentData, ExperimentWaveView, SamplePlanData } from "@/domain/experiment/types";
import { validateSamplePlanForSubmit } from "../../experiment/submit-validation";

const mockExperimentApi = {
    getStats: mock(async () => ({
        success: true,
        data: {
            stats: { tier: { 普通会员: 100, 黑金会员: 100 } },
            numericFields: ["wtp"],
            ppsEligibleFields: [],
            populationNumericStats: { wtp: { mean: 20, variance: 16, stdDev: 4, count: 200 } },
            stratumNumericStats: {},
        },
    })),
    saveWavePlan: mock(async (_taskId: number, _version: number, payload: SamplePlanData) => ({
        success: true,
        data: null as ExperimentData | null,
        payload,
    })),
    executeSampling: mock(async () => ({
        success: true,
        data: { success: true, result: { completed: true, sampleCount: 40 } },
    })),
    dispatchFieldwork: mock(async () => ({
        success: true,
        data: null as ExperimentData | null,
    })),
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
const { PilotWaveStage } = await import("./PilotWaveStage");
bootstrapDom.restore();

let restoreDom: (() => void) | null = null;

function makePilotExperiment(overrides: Partial<ExperimentData> = {}, waveOverrides: Partial<ExperimentWaveView> = {}): ExperimentData {
    const wave1: ExperimentWaveView = {
        waveNumber: 1,
        kind: "pilot",
        label: "第 1 轮 · 首轮试投",
        questionnaire: {
            title: "试投测试",
            welcomeText: "<p>欢迎参与本次匿名商业调研，数据仅作统计研究使用。</p>",
            endingText: "<p>感谢您的认真作答，祝您生活愉快！</p>",
            questions: [],
        },
        samplePlan: null,
        samplingResults: null,
        fieldwork: null,
        cleaningConfig: { removeSpeeders: true, removeStraightliners: true, requirePrimaryTargetValid: true },
        diagnostics: {},
        completedAt: null,
        ...waveOverrides,
    };
    return {
        id: 101,
        taskId: 4,
        version: 2,
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
        populationSize: 200,
        analysisTarget: { inferred: false, target: { kind: "proportion", field: "tier", value: "黑金会员" } },
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" } },
        ...overrides,
    };
}

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/4/experiment").restore;
    Object.values(mockExperimentApi).forEach((fn) => fn.mockClear());
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

describe("PilotWaveStage dogfood UX & server-contract alignment", () => {
    test("enforces 1%–10% proportion marginOfError and keeps fractional nonResponsePct consistent with server validation", async () => {
        const exp = makePilotExperiment();
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

        const view = render(<PilotWaveStage onPrev={() => undefined} />);
        await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalled());

        // Step 3 shows explicit locked hint when no plan/sample exists yet
        expect(view.queryByTestId("student-pilot-dispatch-locked-hint") !== null).toBe(true);
        expect(view.getByTestId("student-pilot-stage-hint").textContent).toContain("保存首轮试投样本量方案");

        const moeInput = view.container.querySelector("#pilot-margin-error") as HTMLInputElement;
        fireEvent.change(moeInput, { target: { value: "0.5" } });
        expect(view.getByTestId("student-pilot-plan-error").textContent).toContain("1%–10%");
        expect((view.getByTestId("student-pilot-save-plan") as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(moeInput, { target: { value: "12" } });
        expect(view.getByTestId("student-pilot-plan-error").textContent).toContain("1%–10%");
        expect((view.getByTestId("student-pilot-save-plan") as HTMLButtonElement).disabled).toBe(true);

        // Valid marginOfError = 8, fractional nonResponsePct = 12.5 -> payload must pass validateSamplePlanForSubmit!
        fireEvent.change(moeInput, { target: { value: "8" } });
        const nrrInput = view.container.querySelector("#pilot-nrr-input") as HTMLInputElement;
        fireEvent.change(nrrInput, { target: { value: "12.5" } });
        expect(view.queryByTestId("student-pilot-plan-error") === null).toBe(true);
        const saveBtn = view.getByTestId("student-pilot-save-plan") as HTMLButtonElement;
        expect(saveBtn.disabled).toBe(false);

        await act(async () => {
            fireEvent.click(saveBtn);
        });
        expect(mockExperimentApi.saveWavePlan).toHaveBeenCalledTimes(1);
        const savedPayload = mockExperimentApi.saveWavePlan.mock.calls[0]![2]!;
        expect(validateSamplePlanForSubmit(savedPayload, 200, "proportion", { minimumSampleSize: 1 })).toBeNull();
    });

    test("first-time sampling before any dispatch shows readiness prompt rather than stale re-dispatch warning", async () => {
        const exp = makePilotExperiment({}, {
            samplePlan: {
                estimationType: "proportion",
                confidenceLevel: "95",
                marginOfError: 8,
                designEffect: 1,
                nonResponseRate: 0.1,
                recommendedSize: 96,
                finalSampleSize: 96,
            },
            samplingResults: {
                simple: { completed: true, sampleCount: 96, data: [] },
            },
            diagnostics: {},
            fieldwork: null,
        });
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

        const view = render(<PilotWaveStage onPrev={() => undefined} />);
        await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalled());

        expect(view.queryByTestId("student-pilot-stale-dispatch-warning") === null).toBe(true);
        expect(view.getByText(/首轮受访者名单已就绪/)).toBeTruthy();
        expect((view.getByTestId("student-pilot-dispatch") as HTMLButtonElement).disabled).toBe(false);
    });
});
