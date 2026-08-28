import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import type { SampleParams } from "../../components/immersive-sample-planning/types";

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
    onComplete?: (params: SampleParams) => void;
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
        onComplete: (params: SampleParams) => void;
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
    expect(lastPlanningProps?.initialPopulationVariance).toBe(67.128040201005);
    expect(lastPlanningProps?.initialEstimationType).toBe("mean");
});

test("completing the overlay persists the variance used to compute n, not a later parent fetch", async () => {
    const view = render(<SamplePlanning onPrev={() => undefined} />);
    await waitFor(() => expect(view.getByTestId("mock-immersive-planning")).toBeTruthy());

    fireEvent.click(view.getByTestId("mock-planning-complete"));
    await waitFor(() => expect(view.getByTestId("student-sample-plan-summary")).toBeTruthy());
    const summary = view.getByTestId("student-sample-plan-summary").textContent ?? "";
    expect(summary).toContain("67.128040201005");
    expect(summary).toContain("49");
});
