import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { ComponentProps } from "react";
import { installDomGlobals } from "@/test-utils/dom";

// Mirror the DOM bootstrap used by the immersive preview tests: testing-library
// must be imported after the first DOM installation, then each test installs a
// fresh document.
const bootstrapDom = installDomGlobals("http://localhost/student");
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");

// docs/VARIABLE_ANALYSIS_TEST_PLAN.md A08：切换报告标签保留未执行的分析配置，
// 隐藏面板不可交互且切换本身不发起分析请求。使用真实 Tabs（forceMount + hidden）。

const mockExperimentApi = {
    getAnalysisMetrics: mock(async () => ({
        success: true,
        data: { numericFields: [], categoricalFields: [], numeric: {}, categorical: {}, target: null },
    })),
};
let mockContext: { experiment: Record<string, unknown> | null; populationSize: number; isSaving: boolean; completeStage: () => Promise<boolean> };

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
    ],
};
const requests: Array<{ method: string; url: string }> = [];
let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/2/experiment").restore;
    localStorage.clear();
    requests.length = 0;
    mockExperimentApi.getAnalysisMetrics.mockClear();
    mockContext = {
        experiment: {
            id: 88, taskId: 2, version: 6, currentStage: 4, populationSize: 8000,
            reportContent: "<p>服务器基线报告。</p>",
            samplePlan: { finalSampleSize: 400 },
            samplingResults: { simple: { completed: true, sampleCount: 400, data: [] } },
        },
        populationSize: 8000,
        isSaving: false,
        completeStage: async () => true,
    };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        requests.push({ method, url });
        if (url.endsWith("/variables")) return Response.json({ success: true, data: { dictionary } });
        if (url.endsWith("/analyses") && method === "GET") return Response.json({ success: true, data: { records: [], capacity: 20 } });
        if (url.endsWith("/analyses") && method === "POST") return Response.json({ success: true, data: { id: 1 } });
        return Response.json({ success: true, data: {} });
    }) as unknown as typeof fetch;
});

afterEach(async () => {
    cleanup();
    await new Promise(resolve => setTimeout(resolve, 0));
    localStorage.clear();
    restoreDom?.();
    restoreDom = null;
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

    const textarea = workspace.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "这个变量的平均水平是多少？" } });
    const selects = workspace.querySelectorAll("select");
    fireEvent.change(selects[1]!, { target: { value: "value" } });
    const weighted = workspace.querySelector('input[type="checkbox"]')!;
    fireEvent.click(weighted);
    expect((textarea as HTMLTextAreaElement).value).toBe("这个变量的平均水平是多少？");
    expect((weighted as HTMLInputElement).checked).toBe(true);

    // 切到报告再切回：配置必须保留
    activate(view, "student-analysis-workspace-report");
    await waitFor(() => expect(panelOf(view).dataset.state).toBe("inactive"));
    activate(view, "student-analysis-workspace-univariate");
    await waitFor(() => expect(panelOf(view).dataset.state).toBe("active"));
    expect((workspace.querySelector("textarea") as HTMLTextAreaElement).value).toBe("这个变量的平均水平是多少？");
    expect((workspace.querySelectorAll("select")[1] as HTMLSelectElement).value).toBe("value");
    expect((workspace.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true);

    // 切换与修改配置都没有发起分析执行
    expect(requests.filter(request => request.method === "POST")).toHaveLength(0);
    // 工作区保持挂载，只加载一次列表
    expect(requests.filter(request => request.method === "GET" && request.url.endsWith("/analyses"))).toHaveLength(1);
});

test("the inactive analysis panel is CSS-hidden while remaining mounted", async () => {
    const view = render(<AnalysisReport onPrev={() => {}} onSubmit={() => {}} />);
    await waitFor(() => expect(view.getByTestId("student-analysis-workspace-univariate")).toBeTruthy());
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
