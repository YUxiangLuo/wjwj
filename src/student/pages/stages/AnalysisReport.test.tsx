import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import type { AnalysisMetricsData } from "../../api-client";
import { createApiClient } from "@/lib/api-client";
import { writeExperimentDraft } from "../../experiment/experiment-draft";

// Smoke coverage for the analysis/report stage: metrics request lifecycle,
// draft restoration, failure visibility, and method-policy filtering.

const mockExperimentApi = {
    getAnalysisMetrics: mock(async (_taskId: number, _signal?: AbortSignal) => ({
        success: true,
        data: {
            ppsMonteCarloReplicates: 256,
            ppsStandardErrorMode: "monte_carlo",
            numericFields: [],
            categoricalFields: [],
            numeric: {},
            categorical: {},
        } as AnalysisMetricsData,
    })),
};
const mockToastError = mock(() => undefined);

let mockExperimentContext: {
    experiment: Record<string, unknown> | null;
    populationSize: number;
    isSaving: boolean;
    completeStage: (stage: number, payload: Record<string, unknown>) => Promise<boolean>;
};

mock.module("../ExperimentLayout", () => ({
    useExperiment: () => mockExperimentContext,
}));

mock.module("../../api-client", () => ({
    experimentApi: mockExperimentApi,
    downloadStudentFile: createApiClient("student").download,
}));

mock.module("sonner", () => ({
    toast: {
        error: mockToastError,
    },
}));

mock.module("@/components/ui/button", () => ({
    Button: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
}));

mock.module("@/components/ui/card", () => ({
    Card: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    CardContent: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    CardHeader: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    CardTitle: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    CardDescription: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
}));

mock.module("@/components/ui/label", () => ({
    Label: ({ children, ...props }: ComponentProps<"label">) => <label {...props}>{children}</label>,
}));

mock.module("@/components/ui/tabs", () => ({
    Tabs: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    TabsList: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    TabsTrigger: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
    TabsContent: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
}));

mock.module("@/components/ui/select", () => ({
    Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectContent: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    SelectItem: ({ children, value, ...props }: ComponentProps<"div"> & { value: string }) => <div data-value={value} {...props}>{children}</div>,
    SelectTrigger: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ""}</span>,
}));

mock.module("@/components/ui/dialog", () => ({
    Dialog: ({ children, open }: { children: ReactNode; open?: boolean }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    DialogHeader: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    DialogTitle: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
    DialogDescription: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
}));

mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({
        dataTestId,
        editorTestId,
        value,
    }: {
        dataTestId?: string;
        editorTestId?: string;
        value: string;
    }) => (
        <div data-testid={dataTestId}>
            <div data-testid={editorTestId} dangerouslySetInnerHTML={{ __html: value }} />
        </div>
    ),
}));

const { AnalysisReport } = await import("./AnalysisReport");

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    const dom = installDomGlobals("http://localhost/student/task/2/experiment");
    restoreDom = dom.restore;
    localStorage.clear();
    mockExperimentApi.getAnalysisMetrics.mockClear();
    mockToastError.mockClear();
    mockExperimentContext = {
        experiment: {
            id: 88,
            taskId: 2,
            version: 6,
            currentStage: 4,
            populationSize: 8000,
            reportContent: "<p>服务器基线报告。</p>",
            samplePlan: {
                finalSampleSize: 400,
            },
            samplingResults: {
                simple: { completed: true, sampleCount: 400, data: [] },
                systematic: { completed: true, sampleCount: 400, data: [] },
                pps: { completed: true, sampleCount: 400, data: [] },
                stratified: { completed: true, data: [], layers: [] },
            },
        },
        populationSize: 8000,
        isSaving: false,
        completeStage: async () => true,
    };
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    localStorage.clear();
    restoreDom?.();
    restoreDom = null;
});

test("AnalysisReport does not refetch metrics when sampling results receive a new reference with unchanged content", async () => {
    const view = render(
        <AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />
    );

    await waitFor(() => {
        expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1);
    });

    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplingResults: JSON.parse(JSON.stringify(mockExperimentContext.experiment?.samplingResults ?? null)),
    };
    view.rerender(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1);
});

test("AnalysisReport restores a version-matched local report draft", async () => {
    writeExperimentDraft(
        { experimentId: 88, experimentVersion: 6, stage: 4 },
        { reportContent: "<p>浏览器恢复的报告草稿。</p>" },
    );

    const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);

    await waitFor(() => expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1));
    expect(view.getByTestId("student-analysis-report-editor").textContent).toContain("浏览器恢复的报告草稿");
    expect(view.getByTestId("student-analysis-report-editor").textContent).not.toContain("服务器基线报告");
});

test("AnalysisReport surfaces a retryable error when analysis metrics fail to load", async () => {
    mockExperimentApi.getAnalysisMetrics.mockRejectedValueOnce(new Error("network"));

    const view = render(
        <AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />
    );

    await waitFor(() => {
        expect(view.getByTestId("student-analysis-metrics-error")).toBeTruthy();
    });
    expect(mockToastError).toHaveBeenCalled();
});

test("analysis retry preserves the report draft and cancels its obsolete request", async () => {
    mockExperimentApi.getAnalysisMetrics.mockRejectedValueOnce(new Error("busy"));
    writeExperimentDraft({ experimentId: 88, stage: 4, experimentVersion: 6 }, { reportContent: "<p>保留这个报告草稿。</p>" });
    const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
    await waitFor(() => expect(view.getByTestId("student-analysis-metrics-retry")).toBeTruthy());
    const firstSignal = mockExperimentApi.getAnalysisMetrics.mock.calls[0]![1]!;
    await act(async () => view.getByTestId("student-analysis-metrics-retry").click());
    await waitFor(() => expect(view.queryByTestId("student-analysis-metrics-error")).toBeNull());
    expect(firstSignal.aborted).toBe(true);
    expect(view.getByTestId("student-analysis-report-editor").textContent).toContain("保留这个报告草稿");
});

test("AnalysisReport omits disabled methods from the export and parameter panels", async () => {
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplingPolicy: {
            version: 1,
            methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" },
        },
        samplingResults: {
            simple: { completed: true, sampleCount: 400, data: [] },
            systematic: { completed: true, sampleCount: 400, data: [] },
        },
    };
    const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
    await waitFor(() => expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1));
    expect(view.container.querySelector('[data-value="pps"]')).toBeNull();
    expect(view.queryByTestId("student-analysis-sampling-params-pps")).toBeNull();
    expect(view.getByTestId("student-analysis-sampling-params-systematic")).toBeTruthy();
});

test("AnalysisReport excludes unselected methods from every analysis chart", async () => {
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplingPolicy: {
            version: 1,
            methods: { simple: "required", systematic: "optional", pps: "optional", stratified: "optional" },
        },
        samplingResults: {
            simple: { completed: true, sampleCount: 400, data: [] },
            systematic: { completed: true, sampleCount: 400, data: [] },
        },
    };
    mockExperimentApi.getAnalysisMetrics.mockResolvedValueOnce({
        success: true,
        data: {
            numericFields: ["数值"],
            categoricalFields: ["类别"],
            numeric: {
                数值: {
                    populationMean: 10,
                    populationVariance: 4,
                    methods: {
                        simple: { estimate: 10, standardError: 1 },
                        systematic: { estimate: 11, standardError: 1.1 },
                        pps: { estimate: 99, standardError: 9.9 },
                        stratified: { estimate: 88, standardError: 8.8 },
                    },
                },
            },
            categorical: {
                类别: {
                    population: { A: 50, B: 50 },
                    methods: {
                        simple: { A: 50, B: 50 },
                        systematic: { A: 50, B: 50 },
                        pps: { 伪类别: 100 },
                        stratified: {},
                    },
                    representativeness: {
                        simple: 0,
                        systematic: 0,
                        pps: 50,
                        stratified: 50,
                    },
                },
            },
        },
    });

    const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
    await waitFor(() => expect(within(view.getByTestId("student-analysis-mean-chart")).getByText("简单随机")).toBeTruthy());

    for (const testId of [
        "student-analysis-mean-chart",
        "student-analysis-error-chart",
    ]) {
        const chart = within(view.getByTestId(testId));
        expect(chart.queryByText("PPS抽样")).toBeNull();
        expect(chart.queryByText("分层抽样")).toBeNull();
    }
});
