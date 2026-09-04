import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import { getAccessibilityViolations } from "@/test-utils/accessibility";
import type { AnalysisMetricsData } from "../../api-client";
import { writeExperimentDraft } from "../../experiment/experiment-draft";

const mockExperimentApi = {
    getAnalysisMetrics: mock(async () => ({
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

mock.module("../../components/RichTextEditor", () => ({
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

test("AnalysisReport labels full-population metrics as virtual-population oracle comparisons", async () => {
    const view = render(
        <AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />
    );

    await waitFor(() => expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1));
    expect(view.getByTestId("student-analysis-oracle-notice").textContent).toContain("完整虚拟总体");
    expect(view.getByTestId("student-analysis-oracle-notice").textContent).toContain("256 次");
    expect(view.getByTestId("student-analysis-oracle-notice").textContent).toContain("模拟误差");
    expect(view.getByTestId("student-analysis-tab-represent").textContent).toContain("总体对照偏差");
});

test("AnalysisReport labels a PPS census SE as exact instead of simulated", async () => {
    mockExperimentApi.getAnalysisMetrics.mockResolvedValueOnce({
        success: true,
        data: {
            ppsMonteCarloReplicates: 0,
            ppsStandardErrorMode: "census_exact",
            numericFields: [],
            categoricalFields: [],
            numeric: {},
            categorical: {},
        },
    });

    const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
    await waitFor(() => expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1));

    const notice = view.getByTestId("student-analysis-oracle-notice").textContent ?? "";
    expect(notice).toContain("全体入样");
    expect(notice).toContain("精确为 0");
    expect(notice).toContain("未执行 Monte Carlo");
    expect(notice).not.toContain("模拟误差");
    expect(view.container.textContent).toContain("PPS 为全体入样");
    expect(view.container.textContent).not.toContain("有限重复次数会带来模拟误差");
    expect(view.container.textContent).toContain("PPS 本次覆盖完整总体");
    expect(view.container.textContent).toContain("当前结果没有抽样误差");
    expect(view.container.textContent).not.toContain("小样本偏差");
});

test("AnalysisReport omits PPS-only guidance when PPS is unavailable", async () => {
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplingResults: {
            ...(mockExperimentContext.experiment?.samplingResults as Record<string, unknown>),
            pps: { completed: false, unavailable: true, unavailableReason: "没有合格的规模变量" },
        },
    };

    const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);

    await waitFor(() => expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1));
    expect(view.getByTestId("student-analysis-oracle-notice").textContent).not.toContain("PPS 标准误");
    expect(view.getByText(/PPS 已按规则跳过，不应纳入方法间比较/)).toBeTruthy();
});

test("AnalysisReport warns when a historical numeric column is excluded for missing values", async () => {
    mockExperimentApi.getAnalysisMetrics.mockResolvedValueOnce({
        success: true,
        data: {
            numericFields: [],
            excludedNumericFields: ["收入"],
            categoricalFields: [],
            numeric: {},
            categorical: {},
        } as AnalysisMetricsData,
    });

    const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
    await waitFor(() => expect(view.getByTestId("student-analysis-invalid-numeric-warning")).toBeTruthy());
    expect(view.getByTestId("student-analysis-invalid-numeric-warning").textContent).toContain("收入");
    expect(view.getByTestId("student-analysis-invalid-numeric-warning").textContent).toContain("已停止");
    expect(view.getByTestId("student-analysis-oracle-notice").textContent).not.toContain("PPS 标准误");
});

test("AnalysisReport shows a visible error when analysis metrics fail to load", async () => {
    mockExperimentApi.getAnalysisMetrics.mockRejectedValueOnce(new Error("network"));

    const view = render(
        <AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />
    );

    await waitFor(() => {
        expect(view.getByTestId("student-analysis-metrics-error")).toBeTruthy();
    });

    expect(view.getByTestId("student-analysis-metrics-error").textContent).toContain("分析指标加载失败");
    expect(mockToastError).toHaveBeenCalledWith("分析指标加载失败，请刷新后重试");
});

test("AnalysisReport shows persisted advanced tool source in the sample plan panel", async () => {
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplePlan: {
            finalSampleSize: 420,
            recommendedSize: 367,
            confidenceLevel: "95",
            marginOfError: 5,
            estimationType: "proportion",
            designEffect: 1,
            nonResponseRate: 0,
            advancedPlanSource: "cv",
        },
    };

    const view = render(
        <AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />
    );

    await waitFor(() => {
        expect(view.getByText("最终样本量来源")).toBeTruthy();
    });

    expect(view.getByText("CV-based计算（高级工具）")).toBeTruthy();
    expect(view.getByText(/完整中间状态与推演明细不会完整写入实验存档/)).toBeTruthy();
    expect(view.getByText(/当前最终样本量由「CV-based计算」回写/)).toBeTruthy();
});

test("AnalysisReport gives icon-only chart controls accessible names", async () => {
    const view = render(
        <AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />
    );

    await waitFor(() => expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1));
    expect(view.getAllByLabelText("放大图表").length).toBeGreaterThan(0);
    expect(view.getAllByLabelText("下载图表 SVG").length).toBeGreaterThan(0);
});

test("AnalysisReport makes populated charts keyboard-scrollable and names the variable selector", async () => {
    const methodMetrics = {
        simple: { estimate: 31, standardError: 1 },
        systematic: { estimate: 30, standardError: 1.1 },
        pps: { estimate: 29, standardError: 1.2 },
        stratified: { estimate: 30.5, standardError: 0.9 },
    };
    mockExperimentApi.getAnalysisMetrics.mockResolvedValueOnce({
        success: true,
        data: {
            numericFields: ["年龄"],
            categoricalFields: [],
            numeric: {
                年龄: {
                    populationMean: 30,
                    populationVariance: 25,
                    methods: methodMetrics,
                },
            },
            categorical: {},
        },
    });

    const view = render(
        <AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />
    );

    await waitFor(() => expect(view.getAllByLabelText("选择数值变量").length).toBeGreaterThan(0));
    expect(view.getAllByLabelText("选择分类变量").length).toBeGreaterThan(0);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const chartRegions = view.getAllByRole("region", { name: "图表数据，可滚动查看" });
    expect(chartRegions.length).toBeGreaterThan(0);
    for (const region of chartRegions) expect(region.tabIndex).toBe(0);
    const violations = await getAccessibilityViolations(view.container);
    expect(violations.find((violation) => violation.id === "scrollable-region-focusable")).toBeUndefined();
});

test("AnalysisReport omits disabled and unselected methods from export and parameter panels", async () => {
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
    expect(view.getByText(/PPS 已由教师在实验模板中设为不适用/)).toBeTruthy();
    expect(view.container.textContent).not.toContain("本次未选择 PPS");
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
    await waitFor(() => expect(view.getByText("类别（分布偏差）")).toBeTruthy());
    await waitFor(() => expect(within(view.getByTestId("student-analysis-mean-chart")).getByText("简单随机")).toBeTruthy());

    for (const testId of [
        "student-analysis-mean-chart",
        "student-analysis-distribution-chart",
        "student-analysis-error-chart",
        "student-analysis-representativeness-chart",
    ]) {
        const chart = within(view.getByTestId(testId));
        expect(chart.getAllByText("简单随机").length).toBeGreaterThan(0);
        expect(chart.getAllByText("系统抽样").length).toBeGreaterThan(0);
        expect(chart.queryByText("PPS抽样")).toBeNull();
        expect(chart.queryByText("分层抽样")).toBeNull();
    }
    expect(within(view.getByTestId("student-analysis-distribution-chart")).queryByText("伪类别")).toBeNull();
});
