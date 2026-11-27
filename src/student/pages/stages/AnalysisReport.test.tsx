import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import { echarts } from "@/components/charts/echarts-core";
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

let mockDownloadStudentFile = createApiClient("student").download;

mock.module("../../api-client", () => ({
    experimentApi: mockExperimentApi,
    downloadStudentFile: (url: string, filename: string) => mockDownloadStudentFile(url, filename),
}));

mock.module("sonner", () => ({
    toast: {
        error: mockToastError,
        success: mock(() => undefined),
        info: mock(() => undefined),
    },
}));

mock.module("@/components/ui/button", () => ({
    Button: ({ children, variant, ...props }: ComponentProps<"button"> & { variant?: string }) => (
        <button data-variant={variant ?? "default"} {...props}>{children}</button>
    ),
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

for (const length of [20, 120, 5001]) {
    test(`report length feedback stays next to the primary action (${length} characters)`, async () => {
        writeExperimentDraft({ experimentId: 88, experimentVersion: 6, stage: 4 }, {
            reportContent: `<p>${"字".repeat(length)}</p>`, workspace: "report",
        });
        const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
        await waitFor(() => expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1));
        const footer = view.getByTestId("student-stage-actions");
        const status = within(footer).getByTestId("student-analysis-length-status");
        expect(status.textContent).toContain(`${length} / 5000 字`);
        expect(status.getAttribute("role")).toBe("status");
        const action = within(footer).getByTestId("student-analysis-preview") as HTMLButtonElement;
        expect(action.disabled).toBe(length < 100 || length > 5000);
        expect(status.textContent).toContain(length < 100 ? "还需至少 80 字" : length > 5000 ? "已超出 1 字" : "字数符合要求");
    });
}

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

test("categorical charts explain their normalization and missing-value denominator", async () => {
    const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
    await waitFor(() => expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1));
    const chart = view.getByTestId("student-analysis-distribution-chart");
    expect(chart.textContent).toContain("数字 1 与文本“1”会合并");
    expect(chart.textContent).toContain("空值作为“（缺失值）”并计入全部行的分母");
    expect(chart.textContent).toContain("单变量分析则按变量字典保留 JSON 原始类型");
    const deviation = view.getByTestId("student-analysis-representativeness-chart");
    expect(deviation.textContent).toContain("各类占比绝对差的平均");
    expect(deviation.textContent).toContain("不能单独证明样本无偏或具有整体代表性");
});

for (const scenario of [
    { name: "mean with exact PPS", kind: "mean", mode: "systematic_exact", ppsText: "PPS 按全部随机起点区间及其概率计算 Hájek 比估计的设计标准误" },
    { name: "mean with census PPS", kind: "mean", mode: "census_exact", ppsText: "设计标准误精确为 0，未执行 Monte Carlo 重复抽样" },
    { name: "mean with legacy Monte Carlo PPS", kind: "mean", mode: "monte_carlo", ppsText: "PPS 为 256 次重复抽样的 Monte Carlo 估计" },
    { name: "categorical proportion without PPS", kind: "proportion", mode: null, ppsText: null },
] as const) {
    test(`design standard error explains population variance rather than sample variance: ${scenario.name}`, async () => {
        mockExperimentContext.experiment = {
            ...mockExperimentContext.experiment,
            analysisTarget: { target: scenario.kind === "mean"
                ? { kind: "mean", field: "数值" }
                : { kind: "proportion", field: "类别", value: "待复检" } },
            ...(scenario.mode === "census_exact" ? {
                samplePlan: { finalSampleSize: 8000 },
                samplingResults: Object.fromEntries(["simple", "systematic", "pps", "stratified"].map((method) => [
                    method, { completed: true, sampleCount: 8000, data: [] },
                ])),
            } : {}),
            ...(scenario.mode === null ? {
                samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" } },
                samplingResults: { simple: { completed: true, sampleCount: 400, data: [] } },
            } : {}),
        };
        mockExperimentApi.getAnalysisMetrics.mockResolvedValueOnce({
            success: true,
            data: {
                ...(scenario.mode ? { ppsStandardErrorMode: scenario.mode, ppsMonteCarloReplicates: 256 } : {}),
                numericFields: [], categoricalFields: [], numeric: {}, categorical: {},
            },
        });
        const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
        const chart = view.getByTestId("student-analysis-error-chart");
        await waitFor(() => {
            expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1);
            if (scenario.ppsText) expect(chart.textContent).toContain(scenario.ppsText);
        });
        expect(chart.textContent).toContain("利用完整虚拟总体");
        expect(chart.textContent).toContain("均值规划的总体方差 σ² 按 N 计算");
        expect(chart.textContent).toContain("按 N−1 计算的总体方差 S² = Nσ²/(N−1)");
        expect(chart.textContent).toContain("不以本次样本方差估计总体方差");
        expect(chart.textContent).toContain("估计量在重复抽样中的波动");
        expect(chart.textContent).not.toContain("标准误则用本次样本的样本方差");
        expect(chart.textContent).not.toContain("总体文件（按 N−1 计算");
        if (!scenario.ppsText) expect(chart.textContent).not.toContain("PPS");
    });
}

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
                        simple: 6.35,
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

    const numeric = view.getByRole("region", { name: "数值均值相对偏差（%）" });
    const categorical = view.getByRole("region", { name: "分类分布偏差（百分点）" });
    expect(numeric.textContent).toContain("10.00%");
    expect(numeric.textContent).not.toContain("类别（分布偏差）");
    expect(categorical.textContent).toContain("6.35百分点");
    expect(categorical.textContent).not.toContain("数值（均值偏差）");
    const numericBar = numeric.querySelector<HTMLElement>('[style*="background-color"]');
    const categoricalBar = categorical.querySelector<HTMLElement>('[style*="background-color"]');
    expect(numericBar?.style.width).toBe("0%");
    expect(categoricalBar?.style.width).toBe("100%");
    expect(numeric.querySelectorAll<HTMLElement>('[style*="background-color"]')[1]?.style.width).toBe("100%");
    await act(async () => within(categorical).getByRole("button", { name: "放大图表" }).click());
    const zoom = view.getByTestId("student-analysis-zoom-dialog");
    expect(zoom.textContent).toContain("6.35百分点");
    expect(zoom.textContent).toContain("使用独立尺度，不可横比");
    expect(zoom.textContent).not.toContain("数值（均值偏差）");
});

test("the mean chart plots the population truth beside every estimate", async () => {
    mockExperimentApi.getAnalysisMetrics.mockResolvedValueOnce({
        success: true,
        data: {
            numericFields: ["数值"],
            categoricalFields: [],
            numeric: {
                数值: {
                    populationMean: 10,
                    populationVariance: 4,
                    methods: {
                        simple: { estimate: 9.5, standardError: 1 },
                        systematic: { estimate: 11, standardError: 1.1 },
                    },
                },
            },
            categorical: {},
            target: null,
        } as never,
    });
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

    const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
    await waitFor(() => expect(within(view.getByTestId("student-analysis-mean-chart")).getByText("简单随机")).toBeTruthy());

    const chart = within(view.getByTestId("student-analysis-mean-chart"));
    // 每个方法行都配一条“总体真值”，其数值为 populationMean。
    expect(chart.getAllByText("总体真值")).toHaveLength(2);
    expect(chart.getAllByText("10.00")).toHaveLength(2);
});

test("AnalysisReport mean chart and outline honor 90% and 99% confidence levels without hardcoding 1.96 or 95%", async () => {
    for (const [level, z] of [["90", 1.645], ["99", 2.576]] as const) {
        localStorage.clear();
        mockExperimentContext.experiment = {
            ...mockExperimentContext.experiment,
            reportContent: "",
            samplePlan: {
                confidenceLevel: level,
                finalSampleSize: 400,
            },
            samplingPolicy: {
                version: 1,
                methods: { simple: "required", systematic: "optional", pps: "optional", stratified: "optional" },
            },
            samplingResults: {
                simple: { completed: true, sampleCount: 400, data: [] },
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
                            simple: { estimate: 10, standardError: 2 },
                            systematic: { estimate: null, standardError: null },
                            pps: { estimate: null, standardError: null },
                            stratified: { estimate: null, standardError: null },
                        },
                    },
                },
                categorical: {
                    类别: {
                        population: { A: 50, B: 50 },
                        methods: {
                            simple: { A: 56.35, B: 43.65 },
                            systematic: {},
                            pps: {},
                            stratified: {},
                        },
                        representativeness: {
                            simple: 6.35,
                            systematic: null,
                            pps: null,
                            stratified: null,
                        },
                    },
                },
                target: null,
            } as never,
        });

        const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
        const meanChart = view.getByTestId("student-analysis-mean-chart");
        await waitFor(() => expect(within(meanChart).getByText("简单随机")).toBeTruthy());

        const expectedLabel = `${level}% 教学误差带（±${z} SE，不保证覆盖率）`;
        const imgNode = meanChart.querySelector<HTMLElement>('[role="img"]');
        const instance = imgNode ? echarts.getInstanceByDom(imgNode) : null;
        const opt = instance?.getOption() as {
            series?: Array<{ name?: string; type?: string; data?: Array<number[]> }>;
            tooltip?: Array<{ formatter?: (params: unknown) => string }>;
        } | undefined;
        const customSeries = opt?.series?.find((s) => s.type === "custom");
        expect(customSeries?.name).toBe(expectedLabel);
        expect(customSeries?.data?.[0]?.[1]).toBeCloseTo(10 - z * 2, 6);
        expect(customSeries?.data?.[0]?.[2]).toBeCloseTo(10 + z * 2, 6);

        const tooltipHtml = opt?.tooltip?.[0]?.formatter?.([{ dataIndex: 0 }]) ?? "";
        expect(tooltipHtml).toContain(expectedLabel);
        expect(tooltipHtml).not.toContain("95% 设计区间");

        // Outline starter must also use the planned confidence level and teaching error band wording
        await act(async () => view.getByTestId("student-report-insert-outline").click());
        const reportText = view.getByTestId("student-analysis-report-editor").textContent ?? "";
        expect(reportText).toContain(expectedLabel);
        expect(reportText).not.toContain("95% 置信区间");

        // QA-S2-05: category-count K sensitivity & same-frame cross-method comparison disclaimer
        const deviationSection = view.getByTestId("student-analysis-representativeness-chart");
        expect(deviationSection.textContent).toContain("类别总数 K");
        expect(deviationSection.textContent).toContain("同一抽样框");

        // QA-P2-02: categorical deviation Y-axis title is left-aligned so it never clips left at 1024x768
        const catRegion = view.getByRole("region", { name: "分类分布偏差（百分点）" });
        const catImg = catRegion.querySelector<HTMLElement>('[role="img"]');
        const catInstance = catImg ? echarts.getInstanceByDom(catImg) : null;
        const catOpt = catInstance?.getOption() as {
            yAxis?: Array<{ name?: string; nameTextStyle?: { align?: string } }>;
        } | undefined;
        expect(catOpt?.yAxis?.[0]?.name).toBe("偏差（百分点）");
        expect(catOpt?.yAxis?.[0]?.nameTextStyle?.align).toBe("left");
        const yNameTextNode = [...(catRegion.querySelectorAll("svg text") ?? [])]
            .find((el) => el.textContent?.trim() === "偏差（百分点）");
        expect(yNameTextNode?.getAttribute("text-anchor")).toBe("start");

        cleanup();
    }
});

test("excludedNumericFields warning covers precision bounds, and Export CSV uses MD3 secondary tonal variant and auto-closes on success", async () => {
    mockExperimentApi.getAnalysisMetrics.mockResolvedValueOnce({
        success: true,
        data: {
            excludedNumericFields: ["subnormal_metric"],
            numericFields: [],
            categoricalFields: [],
            numeric: {},
            categorical: {},
        },
    });
    const downloadedCalls: Array<[string, string]> = [];
    const defaultDownload = mockDownloadStudentFile;
    mockDownloadStudentFile = async (url, filename) => {
        downloadedCalls.push([url, filename]);
    };

    try {
        const view = render(<AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />);
        const warning = await waitFor(() => view.getByTestId("student-analysis-invalid-numeric-warning"));
        expect(warning.textContent).toContain("subnormal_metric");
        expect(warning.textContent).toContain("含空值、非数值或超出可靠浮点精度范围");

        await act(async () => {
            view.getByRole("button", { name: "导出数据" }).click();
        });
        const exportCsvBtn = await waitFor(() => view.getByRole("button", { name: "导出 CSV" }));
        expect(exportCsvBtn.getAttribute("data-variant")).toBe("secondary");

        await act(async () => {
            exportCsvBtn.click();
        });
        expect(downloadedCalls).toEqual([["/api/student/tasks/2/export?type=all", "sampling_all.csv"]]);
        await waitFor(() => expect(view.queryByRole("button", { name: "导出 CSV" }) === null).toBe(true));
    } finally {
        mockDownloadStudentFile = defaultDownload;
    }
});
