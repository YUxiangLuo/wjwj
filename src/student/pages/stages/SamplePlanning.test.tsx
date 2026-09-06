import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import type {
    SampleParams,
    SamplePlanningWizardDraft,
} from "../../components/immersive-sample-planning/types";

const mockExperimentApi = {
    getStats: mock(async () => ({
        success: true,
        data: {
            populationNumericStats: {
                每周学习时长: { mean: 20, variance: 67.128040201005, stdDev: 8.19, count: 200 },
            },
        },
    })),
};

let mockExperimentContext: {
    populationSize: number;
    experiment: Record<string, unknown> | null;
    completeStage: (stage: number, data: Record<string, unknown>) => Promise<boolean>;
};

let lastPlanningProps: {
    initialMarginOfError?: number;
    initialPopulationVariance?: number;
    initialEstimationType?: string;
    initialDraft?: SamplePlanningWizardDraft | null;
    onDraftChange?: (draft: SamplePlanningWizardDraft) => void;
    onComplete?: (params: SampleParams) => void;
    onClose?: () => void;
} | null = null;

mock.module("../ExperimentLayout", () => ({
    useExperiment: () => mockExperimentContext,
}));

mock.module("../../api-client", () => ({
    experimentApi: mockExperimentApi,
}));

mock.module("sonner", () => ({
    toast: { error: mock(() => undefined), success: mock(() => undefined) },
}));

mock.module("@/components/ui/button", () => ({
    Button: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
}));

mock.module("@/components/ui/card", () => ({
    Card: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    CardContent: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    CardHeader: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    CardTitle: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
}));

mock.module("@/components/ui/alert-dialog", () => ({
    AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    AlertDialogAction: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
    AlertDialogCancel: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
    AlertDialogContent: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    AlertDialogDescription: ({ children, asChild: _asChild, ...props }: ComponentProps<"div"> & { asChild?: boolean }) => <div {...props}>{children}</div>,
    AlertDialogFooter: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    AlertDialogHeader: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    AlertDialogTitle: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
}));

mock.module("../../components/immersive-sample-planning", () => ({
    ImmersiveSamplePlanning: (props: {
        initialMarginOfError?: number;
        initialPopulationVariance?: number;
        initialEstimationType?: string;
        initialDraft?: SamplePlanningWizardDraft | null;
        onDraftChange?: (draft: SamplePlanningWizardDraft) => void;
        onComplete: (params: SampleParams) => void;
        onClose: () => void;
    }) => {
        lastPlanningProps = props;
        return (
            <div data-testid="mock-immersive-planning">
                <button
                    type="button"
                    data-testid="mock-planning-complete"
                    onClick={() => props.onComplete({
                        populationSize: 200,
                        estimationType: (props.initialEstimationType as SampleParams["estimationType"]) ?? "mean",
                        confidenceLevel: "95",
                        marginOfError: props.initialMarginOfError ?? 2,
                        populationVariance: props.initialPopulationVariance,
                        designEffect: 1,
                        nonResponseRate: 0,
                        recommendedSize: 49,
                        finalSampleSize: 49,
                    })}
                >
                    complete
                </button>
                <button
                    type="button"
                    data-testid="mock-planning-progress"
                    onClick={() => props.onDraftChange?.({
                        navigation: {
                            phase: { type: "quiz", questionIndex: 1 },
                            challenge: { guess: 48, revealed: true },
                        },
                        confidenceLevel: "99",
                        marginOfError: 3,
                        designEffect: 1.5,
                        nonResponseRate: 0.1,
                        estimationType: "mean",
                        populationVariance: 67.128040201005,
                        finalSampleSize: 75,
                        userTouchedFinal: true,
                        advancedPlanSource: null,
                        domains: [],
                        surveyVariables: [],
                    })}
                >
                    progress
                </button>
                <button
                    type="button"
                    data-testid="mock-planning-close"
                    onClick={props.onClose}
                >
                    close
                </button>
            </div>
        );
    },
}));

mock.module("../../components/ImmersiveExperimentLaunch", () => ({
    ImmersiveExperimentLaunch: () => null,
}));

const { SamplePlanning } = await import("./SamplePlanning");

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    const dom = installDomGlobals("http://localhost/student/task/2/experiment");
    restoreDom = dom.restore;
    lastPlanningProps = null;
    mockExperimentApi.getStats.mockClear();
    mockExperimentContext = {
        populationSize: 200,
        experiment: {
            id: 88,
            version: 1,
            taskId: 2,
            currentStage: 2,
            analysisTarget: { target: { kind: "mean", field: "每周学习时长" }, inferred: false },
        },
        completeStage: async () => true,
    };
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("zero target variance does not open a wizard with invented variance", async () => {
    mockExperimentApi.getStats.mockResolvedValueOnce({ success: true, data: {
        populationNumericStats: { 每周学习时长: { mean: 0, variance: 0, stdDev: 0, count: 200 } },
    } });
    const view = render(<SamplePlanning onPrev={() => {}} />);
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("方差为0"));
    expect(lastPlanningProps).toBeNull();
    expect(view.queryByTestId("student-sample-plan-next")).toBeNull();
});

test("failed target variance can be retried without silently using 100", async () => {
    mockExperimentApi.getStats.mockRejectedValueOnce(new Error("offline"));
    const view = render(<SamplePlanning onPrev={() => {}} />);
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("方差加载失败"));
    expect(lastPlanningProps).toBeNull();
    fireEvent.click(view.getByText("重新加载研究目标方差"));
    await waitFor(() => expect(lastPlanningProps?.initialPopulationVariance).toBeGreaterThan(0));
    expect(lastPlanningProps?.initialPopulationVariance).not.toBe(100);
    expect(view.queryByRole("alert")).toBeNull();
});

test("mean-locked first visit waits for target variance then opens overlay with ME=2", async () => {
    let releaseStats: (() => void) | undefined;
    mockExperimentApi.getStats.mockImplementationOnce(() => new Promise((resolve) => {
        releaseStats = () => resolve({
            success: true,
            data: {
                populationNumericStats: {
                    每周学习时长: { mean: 20, variance: 67.128040201005, stdDev: 8.19, count: 200 },
                },
            },
        });
    }));

    const view = render(<SamplePlanning onPrev={() => undefined} />);
    expect(view.queryByTestId("mock-immersive-planning")).toBeNull();
    expect(view.getByTestId("student-sample-plan-start").textContent).toContain("正在加载对照变量方差");

    releaseStats?.();

    await waitFor(() => expect(view.getByTestId("mock-immersive-planning")).toBeTruthy());
    expect(lastPlanningProps?.initialMarginOfError).toBe(2);
    expect(lastPlanningProps?.initialPopulationVariance).toBeCloseTo(66.7924, 10);
    expect(lastPlanningProps?.initialEstimationType).toBe("mean");
    expect(view.container.textContent).toContain("200 个总体单位");
});

test("closing the immersive planner restores focus to its trigger", async () => {
    const view = render(<SamplePlanning onPrev={() => undefined} />);
    await waitFor(() => expect(view.getByTestId("mock-immersive-planning")).toBeTruthy());

    fireEvent.click(view.getByTestId("mock-planning-close"));

    await waitFor(() => {
        expect(view.queryByTestId("mock-immersive-planning")).toBeNull();
        expect(document.activeElement).toBe(view.getByTestId("student-sample-plan-start"));
    });
});

test("completing the overlay persists the variance used to compute n, not a later parent fetch", async () => {
    const view = render(<SamplePlanning onPrev={() => undefined} />);
    await waitFor(() => expect(view.getByTestId("mock-immersive-planning")).toBeTruthy());

    fireEvent.click(view.getByTestId("mock-planning-complete"));
    await waitFor(() => expect(view.getByTestId("student-sample-plan-summary")).toBeTruthy());
    const summary = view.getByTestId("student-sample-plan-summary").textContent ?? "";
    expect(summary).toContain("66.8");
    expect(summary).not.toContain(String(lastPlanningProps?.initialPopulationVariance));
    expect(summary).not.toContain("67.128040201005");
    expect(summary).toContain("49");
});

test("first-visit immersive progress is flushed and restored before a final plan exists", async () => {
    const firstView = render(<SamplePlanning onPrev={() => undefined} />);
    await waitFor(() => expect(firstView.getByTestId("mock-immersive-planning")).toBeTruthy());
    fireEvent.click(firstView.getByTestId("mock-planning-progress"));
    firstView.unmount();

    const restoredView = render(<SamplePlanning onPrev={() => undefined} />);
    await waitFor(() => expect(restoredView.getByTestId("mock-immersive-planning")).toBeTruthy());
    expect(lastPlanningProps?.initialDraft).toMatchObject({
        navigation: { phase: { type: "quiz", questionIndex: 1 } },
        confidenceLevel: "99",
        finalSampleSize: 75,
    });
});
