import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import type { AnalysisConfig, SavedAnalysisView } from "@/domain/variables/types";

// Mirror the DOM bootstrap used by the immersive preview tests: testing-library
// must be imported after the first DOM installation, then each test installs a
// fresh document.
const bootstrapDom = installDomGlobals("http://localhost/student");
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");

// 切换报告标签保留未执行的分析配置；隐藏面板不可交互且切换本身不发起分析请求。
// 使用真实 Tabs（forceMount + hidden）。

const mockExperimentApi = {
    getAnalysisMetrics: mock(async () => ({
        success: true,
        data: { numericFields: [], categoricalFields: [], numeric: {}, categorical: {}, target: null },
    })),
};
const mockRequireRefresh = mock(() => undefined);
let mockContext: {
    experiment: Record<string, unknown> | null; populationSize: number; isSaving: boolean;
    refreshRequired: boolean; requireRefresh: () => void; completeStage: () => Promise<boolean>;
};

mock.module("../ExperimentLayout", () => ({ useExperiment: () => mockContext }));
mock.module("../../api-client", () => ({ experimentApi: mockExperimentApi, downloadStudentFile: async () => ({ success: true }) }));
mock.module("sonner", () => ({ toast: { error: mock(() => undefined), success: mock(() => undefined) } }));
mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({ value, dataTestId }: { value: string; dataTestId?: string }) => <div data-testid={dataTestId} dangerouslySetInnerHTML={{ __html: value }} />,
}));
mock.module("@/components/ui/button", () => ({
    Button: ({ children, ...props }: ComponentProps<"button">) => <button {...props}>{children}</button>,
}));

const { AnalysisReport } = await import("./AnalysisReport");
bootstrapDom.restore();

const dictionary = {
    source: "source-hash",
    revision: 1,
    variables: [
        { field: "value", label: "分数", unit: "", kind: "continuous" as const, categories: [], missing: [null] },
        { field: "tier", label: "会员等级", unit: "", kind: "ordinal" as const, categories: [{ value: "普通", label: "普通" }, { value: "黑金", label: "黑金" }], missing: [null] },
    ],
};
const requests: Array<{ method: string; url: string; body?: { requestId: string; config: AnalysisConfig } }> = [];
const savedAnalyses = new Map<string, SavedAnalysisView>();
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
const nativeCrypto = globalThis.crypto;
let analysisPostErrorCode: string | null = null;
let lostAnalysisResponses = 0;
let restoreDom: (() => void) | null = null;

async function selectComboboxOption(view: ReturnType<typeof render>, ariaLabel: string, optionName: string) {
    fireEvent.keyDown(view.getByRole("combobox", { name: ariaLabel }), { key: "ArrowDown" });
    const item = await waitFor(() => view.getByRole("option", { name: optionName }));
    fireEvent.keyDown(item, { key: "Enter" });
    await waitFor(() => expect(view.queryByRole("listbox")).toBeNull());
}

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/2/experiment").restore;
    localStorage.clear();
    requests.length = 0;
    analysisPostErrorCode = null;
    lostAnalysisResponses = 0;
    savedAnalyses.clear();
    mockExperimentApi.getAnalysisMetrics.mockClear();
    mockRequireRefresh.mockClear();
    mockContext = {
        experiment: {
            id: 88, taskId: 2, version: 6, currentStage: 5, populationSize: 8000,
            reportContent: "<p>服务器基线报告。</p>",
            samplePlan: { finalSampleSize: 400 },
            samplingResults: { simple: { completed: true, sampleCount: 400, data: [] } },
        },
        populationSize: 8000,
        isSaving: false,
        refreshRequired: false,
        requireRefresh: mockRequireRefresh,
        completeStage: async () => true,
    };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
        requests.push({ method, url, body });
        if (url.endsWith("/variables")) return Response.json({ success: true, data: { dictionary } });
        if (url.endsWith("/analyses") && method === "GET") return Response.json({ success: true, data: { records: [], capacity: 20 } });
        if (url.endsWith("/analyses") && method === "POST") {
            if (analysisPostErrorCode) {
                return Response.json({ success: false, error: { code: analysisPostErrorCode, message: "分析数据已更新" } }, { status: 409 });
            }
            if (!savedAnalyses.has(body.requestId)) savedAnalyses.set(body.requestId, {
                id: savedAnalyses.size + 1, config: body.config, variable: dictionary.variables[0]!,
                result: { kind: "numeric", sampleCount: 2, validCount: 2, missingCount: 0, weighted: false,
                    mean: 3, sampleStandardDeviation: Math.SQRT2, min: 2, max: 4, q1: 2.5, median: 3, q3: 3.5 },
                source: dictionary.source, dictionaryRevision: 1, samplingGeneration: 1,
                algorithmVersion: "test", createdAt: "2026-10-28T00:00:00Z", stale: false,
            });
            // The server commits, but the browser loses the response: a retry
            // must carry the same ID so the server can return the saved record.
            if (lostAnalysisResponses-- > 0) throw new TypeError("Failed to fetch");
            return Response.json({ success: true, data: savedAnalyses.get(body.requestId) });
        }
        return Response.json({ success: true, data: {} });
    }) as unknown as typeof fetch;
});

afterEach(async () => {
    cleanup();
    await new Promise(resolve => setTimeout(resolve, 0));
    localStorage.clear();
    restoreDom?.();
    restoreDom = null;
    Object.defineProperty(globalThis, "crypto", originalCrypto);
});

// Radix 标签在 mouseDown 上切换；forceMount 面板用 data-state + CSS 隐藏。
const activate = (view: ReturnType<typeof render>, testId: string) => fireEvent.mouseDown(view.getByTestId(testId), { button: 0 });
const panelOf = (view: ReturnType<typeof render>) => view.getByTestId("student-univariate-workspace").closest('[data-slot="tabs-content"]') as HTMLElement;

test("switching workspace tabs keeps an unexecuted analysis config and never auto-runs it", async () => {
    const view = render(<AnalysisReport onPrev={() => {}} onSubmit={() => {}} />);
    await waitFor(() => expect(view.getByTestId("student-analysis-workspace-univariate")).toBeTruthy());
    activate(view, "student-analysis-workspace-univariate");
    await waitFor(() => expect(panelOf(view).dataset.state).toBe("active"));
    const workspace = view.getByTestId("student-univariate-workspace");

    await waitFor(() => expect(view.getByRole("combobox", { name: "选择目标分析变量" })).toBeTruthy());
    const textarea = workspace.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "这个变量的平均水平是多少？" } });
    await selectComboboxOption(view, "选择目标分析变量", "分数");
    await selectComboboxOption(view, "选择交叉分组维度", "按「会员等级」交叉对比");
    const weighted = view.getByRole("switch");
    fireEvent.click(weighted);
    expect((textarea as HTMLTextAreaElement).value).toBe("这个变量的平均水平是多少？");
    expect(weighted.getAttribute("aria-checked")).toBe("true");

    // 切到报告再切回：配置必须保留
    activate(view, "student-analysis-workspace-report");
    await waitFor(() => expect(panelOf(view).dataset.state).toBe("inactive"));
    activate(view, "student-analysis-workspace-univariate");
    await waitFor(() => expect(panelOf(view).dataset.state).toBe("active"));
    expect((workspace.querySelector("textarea") as HTMLTextAreaElement).value).toBe("这个变量的平均水平是多少？");
    expect(view.getByRole("combobox", { name: "选择目标分析变量" }).textContent).toContain("分数");
    expect(view.getByRole("combobox", { name: "选择交叉分组维度" }).textContent).toContain("会员等级");
    expect(view.getByRole("switch").getAttribute("aria-checked")).toBe("true");

    // 切换与修改配置都没有发起分析执行
    expect(requests.filter(request => request.method === "POST")).toHaveLength(0);
    // 工作区保持挂载，只加载一次列表
    expect(requests.filter(request => request.method === "GET" && request.url.endsWith("/analyses"))).toHaveLength(1);
});

test("the inactive analysis panel is CSS-hidden while remaining mounted", async () => {
    const view = render(<AnalysisReport onPrev={() => {}} onSubmit={() => {}} />);
    await waitFor(() => expect(view.getByTestId("student-analysis-workspace-univariate")).toBeTruthy());
    const categoryContract = await waitFor(() => view.getByTestId("student-univariate-category-contract"));
    expect(categoryContract.textContent).toContain("数字 1 与文本“1”不同");
    expect(categoryContract.textContent).toContain("排除字典声明的缺失编码");
    expect(categoryContract.textContent).toContain("两处分类比例可能不同");
    // 默认在工作区概览：单变量面板已挂载，但处于 inactive（由 data-[state=inactive]:hidden 隐藏）
    expect(panelOf(view).dataset.state).toBe("inactive");
    expect(panelOf(view).className).toContain("data-[state=inactive]:hidden");
    activate(view, "student-analysis-workspace-univariate");
    await waitFor(() => expect(panelOf(view).dataset.state).toBe("active"));
    activate(view, "student-analysis-workspace-report");
    await waitFor(() => expect(panelOf(view).dataset.state).toBe("inactive"));
    // 挂载只发生一次：切换不重新加载指标
    expect(mockExperimentApi.getAnalysisMetrics).toHaveBeenCalledTimes(1);
});

test("an analysis conflict requires a page refresh and prevents repeated writes", async () => {
    analysisPostErrorCode = "SOURCE_CONFLICT";
    const view = render(<AnalysisReport onPrev={() => {}} onSubmit={() => {}} />);
    await waitFor(() => expect(view.getByTestId("student-analysis-workspace-univariate")).toBeTruthy());
    activate(view, "student-analysis-workspace-univariate");
    await waitFor(() => expect(panelOf(view).dataset.state).toBe("active"));

    await waitFor(() => expect(view.getByRole("combobox", { name: "选择目标分析变量" })).toBeTruthy());
    const workspace = view.getByTestId("student-univariate-workspace");
    fireEvent.change(workspace.querySelector("textarea")!, { target: { value: "这个变量的平均水平是多少？" } });
    await selectComboboxOption(view, "选择目标分析变量", "分数");
    fireEvent.click(view.getByTestId("student-univariate-run"));

    await waitFor(() => expect(mockRequireRefresh).toHaveBeenCalledTimes(1));
    expect(requests.filter(request => request.method === "POST" && request.url.endsWith("/analyses"))).toHaveLength(1);

    mockContext = { ...mockContext, refreshRequired: true };
    view.rerender(<AnalysisReport onPrev={() => {}} onSubmit={() => {}} />);
    const runButton = view.getByTestId("student-univariate-run") as HTMLButtonElement;
    expect(runButton.disabled).toBe(true);
    fireEvent.click(runButton);
    expect(requests.filter(request => request.method === "POST" && request.url.endsWith("/analyses"))).toHaveLength(1);
});

async function readyAnalysis() {
    const view = render(<AnalysisReport onPrev={() => {}} onSubmit={() => {}} />);
    await waitFor(() => expect(view.getByTestId("student-univariate-workspace")).toBeTruthy());
    activate(view, "student-analysis-workspace-univariate");
    await waitFor(() => expect(panelOf(view).dataset.state).toBe("active"));
    await waitFor(() => expect(view.getByRole("combobox", { name: "选择目标分析变量" })).toBeTruthy());
    const workspace = view.getByTestId("student-univariate-workspace");
    fireEvent.change(workspace.querySelector("textarea")!, { target: { value: "这个变量的平均水平是多少？" } });
    await selectComboboxOption(view, "选择目标分析变量", "分数");
    return { view, workspace };
}
const analysisPosts = () => requests.filter(request => request.method === "POST" && request.url.endsWith("/analyses"));
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function useHttpCrypto() {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {
        getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto),
    } });
}

test("HTTP without randomUUID can execute and display a saved analysis", async () => {
    useHttpCrypto();
    const { view } = await readyAnalysis();
    fireEvent.click(view.getByTestId("student-univariate-run"));
    await waitFor(() => expect(view.getByText("已保存实证分析卡片（1/20）")).toBeTruthy());
    expect(analysisPosts()[0]!.body!.requestId).toMatch(uuidV4);
    expect((view.getByTestId("student-univariate-run") as HTMLButtonElement).disabled).toBe(false);
    expect(view.queryByRole("alert")).toBeNull();
});

test("ID generation failure releases the button and preserves the config for retry", async () => {
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: {
        getRandomValues: () => { throw new Error("randomness unavailable"); },
    } });
    const { view, workspace } = await readyAnalysis();
    fireEvent.click(view.getByTestId("student-univariate-run"));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("配置已保留"));
    expect(analysisPosts()).toHaveLength(0);
    expect((view.getByTestId("student-univariate-run") as HTMLButtonElement).disabled).toBe(false);
    expect(workspace.querySelector("textarea")!.value).toBe("这个变量的平均水平是多少？");
    expect(view.getByRole("combobox", { name: "选择目标分析变量" }).textContent).toContain("分数");
    useHttpCrypto();
    fireEvent.click(view.getByTestId("student-univariate-run"));
    await waitFor(() => expect(view.getByText("已保存实证分析卡片（1/20）")).toBeTruthy());
});

test("retry after a lost response reuses the request ID and saves only one record", async () => {
    useHttpCrypto();
    lostAnalysisResponses = 1;
    const { view } = await readyAnalysis();
    fireEvent.click(view.getByTestId("student-univariate-run"));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("网络连接失败"));
    expect((view.getByTestId("student-univariate-run") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(view.getByTestId("student-univariate-run"));
    await waitFor(() => expect(view.getByText("已保存实证分析卡片（1/20）")).toBeTruthy());
    expect(analysisPosts()).toHaveLength(2);
    expect(analysisPosts()[1]!.body!.requestId).toBe(analysisPosts()[0]!.body!.requestId);
    expect(savedAnalyses.size).toBe(1);

    // A deliberate new execution after success is a new request.
    fireEvent.click(view.getByTestId("student-univariate-run"));
    await waitFor(() => expect(view.getByText("已保存实证分析卡片（2/20）")).toBeTruthy());
    expect(analysisPosts()[2]!.body!.requestId).not.toBe(analysisPosts()[0]!.body!.requestId);
});

test("changing the config after failure creates a new request ID", async () => {
    useHttpCrypto();
    lostAnalysisResponses = 1;
    const { view, workspace } = await readyAnalysis();
    fireEvent.click(view.getByTestId("student-univariate-run"));
    await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
    fireEvent.change(workspace.querySelector("textarea")!, { target: { value: "修改后的研究问题是什么？" } });
    fireEvent.click(view.getByTestId("student-univariate-run"));
    await waitFor(() => expect(view.queryByRole("alert")).toBeNull());
    await waitFor(() => expect(view.getByTestId("univariate-result-chart-2").querySelector("svg") !== null).toBe(true));
    expect(analysisPosts()).toHaveLength(2);
    expect(analysisPosts()[1]!.body!.requestId).not.toBe(analysisPosts()[0]!.body!.requestId);
    expect(analysisPosts()[1]!.body!.config.question).toBe("修改后的研究问题是什么？");
});

test("renders overview cross-method CI chart, 4 ECharts multi-dimensional tabs (dist toggle + represent radar), and interactive zoom", async () => {
    mockContext = {
        ...mockContext,
        experiment: {
            ...mockContext.experiment,
            samplingResults: {
                simple: { completed: true, sampleCount: 400, data: [] },
                stratified: { completed: true, sampleCount: 400, data: [], layers: [] },
            },
        },
    };
    mockExperimentApi.getAnalysisMetrics.mockResolvedValueOnce({
        success: true,
        data: {
            numericFields: ["客单价", "等待时长"],
            categoricalFields: ["会员等级"],
            numeric: {
                客单价: {
                    populationMean: 100,
                    populationVariance: 400,
                    methods: {
                        simple: { estimate: 98.2, standardError: 1.5 },
                        systematic: { estimate: null, standardError: null },
                        pps: { estimate: null, standardError: null },
                        stratified: { estimate: 100.4, standardError: 0.9 },
                    },
                },
                等待时长: {
                    populationMean: 25,
                    populationVariance: 36,
                    methods: {
                        simple: { estimate: 26.1, standardError: 0.6 },
                        systematic: { estimate: null, standardError: null },
                        pps: { estimate: null, standardError: null },
                        stratified: { estimate: 24.9, standardError: 0.4 },
                    },
                },
            },
            categorical: {
                会员等级: {
                    population: { 普通: 70, 黑金: 30 },
                    methods: {
                        simple: { 普通: 68, 黑金: 32 },
                        systematic: {},
                        pps: {},
                        stratified: { 普通: 70, 黑金: 30 },
                    },
                    representativeness: {
                        simple: 2,
                        systematic: null,
                        pps: null,
                        stratified: 0,
                    },
                },
            },
            target: {
                contract: {
                    inferred: false,
                    contract: {
                        researchQuestion: "门店客单价估计",
                        target: { kind: "mean", field: "客单价" },
                    },
                },
                confidenceLevel: "95",
                plannedMarginOfError: 3,
                unit: "元",
                populationValue: 100,
                methods: {
                    simple: {
                        estimate: 98.2,
                        standardError: 1.5,
                        marginOfError: 2.94,
                        sampleSize: 400,
                        effectiveSampleSize: 400,
                        reliability: { status: "ok", reasons: [] },
                    },
                    systematic: {
                        estimate: null,
                        standardError: null,
                        marginOfError: null,
                        sampleSize: null,
                        effectiveSampleSize: null,
                        reliability: { status: "unavailable", reasons: [] },
                    },
                    pps: {
                        estimate: null,
                        standardError: null,
                        marginOfError: null,
                        sampleSize: null,
                        effectiveSampleSize: null,
                        reliability: { status: "unavailable", reasons: [] },
                    },
                    stratified: {
                        estimate: 100.4,
                        standardError: 0.9,
                        marginOfError: 1.76,
                        sampleSize: 400,
                        effectiveSampleSize: 980,
                        reliability: { status: "ok", reasons: [] },
                    },
                },
            },
        } as never,
    });

    const view = render(<AnalysisReport onPrev={() => {}} onSubmit={() => {}} />);
    const overviewChart = await waitFor(() => view.getByTestId("student-target-comparison-chart"));
    expect(overviewChart.querySelector("svg") !== null).toBe(true);

    // Switch to multi-dimensional charts workspace
    activate(view, "student-analysis-section-tab-charts");
    const meanTab = await waitFor(() => view.getByTestId("student-analysis-mean-chart"));
    expect(meanTab.querySelector("svg") !== null).toBe(true);

    // Switch to dist tab and toggle 100% stacked view + zoom modal
    activate(view, "student-analysis-tab-dist");
    const distTab = await waitFor(() => view.getByTestId("student-analysis-distribution-chart"));
    expect(distTab.querySelector("svg") !== null).toBe(true);
    const stackedBtn = view.getByTestId("student-analysis-dist-mode-stacked");
    fireEvent.click(stackedBtn);
    expect(stackedBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(distTab.querySelector('button[aria-label="放大图表"]')!);
    const zoomDialog = await waitFor(() => view.getByTestId("student-analysis-zoom-dialog"));
    expect(zoomDialog.querySelector("svg") !== null).toBe(true);
    fireEvent.keyDown(zoomDialog, { key: "Escape" });

    // Switch to error tab -> ranked precision lollipop SVG
    activate(view, "student-analysis-tab-error");
    const errorTab = await waitFor(() => view.getByTestId("student-analysis-error-chart"));
    expect(errorTab.querySelector("svg") !== null).toBe(true);

    // Switch to represent tab -> 3 total metrics (2 numeric + 1 categorical) renders Radar + 2 bar charts
    activate(view, "student-analysis-tab-represent");
    const radar = await waitFor(() => view.getByTestId("student-analysis-represent-radar"));
    expect(radar.querySelector("svg") !== null).toBe(true);
});
