import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import { buildStratifiedNumericStats, buildStratifiedStats } from "@/domain/statistics/population";
import type { AnalysisTarget } from "@/lib/analysis-target";

type PopulationStats = NonNullable<Awaited<ReturnType<typeof import("../../api-client").experimentApi.getStats>>["data"]>;

const mockExperimentApi = {
    getStats: mock(async (_taskId: number, _signal?: AbortSignal) => ({
        success: true,
        data: {
            stats: {},
            numericFields: [] as string[],
            ppsEligibleFields: [] as string[],
        } as PopulationStats,
    })),
    executeSampling: mock(async () => ({ success: true, data: { result: null as any } })),
};

let mockExperimentContext: {
    populationSize: number;
    experiment: Record<string, unknown> | null;
    completeStage: (stage: number, data: Record<string, unknown>) => Promise<boolean>;
};

mock.module("../ExperimentLayout", () => ({
    useExperiment: () => mockExperimentContext,
}));

mock.module("../../api-client", () => ({
    experimentApi: mockExperimentApi,
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

mock.module("@/components/ui/input", () => ({
    Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

mock.module("@/components/ui/label", () => ({
    Label: ({ children, ...props }: ComponentProps<"label">) => <label {...props}>{children}</label>,
}));

mock.module("@/components/ui/badge", () => ({
    Badge: ({ children, ...props }: ComponentProps<"div">) => <div {...props}>{children}</div>,
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

mock.module("../../components/ImmersiveSamplingAnimation", () => ({
    ImmersiveSamplingAnimation: ({ sampledData }: { sampledData?: unknown[] }) => (
        <div data-testid="mock-sampling-animation">结果 {sampledData?.length ?? 0} 条</div>
    ),
}));

mock.module("../../components/ImmersiveExperimentLaunch", () => ({
    ImmersiveExperimentLaunch: () => null,
}));

mock.module("../../components/SamplingSuccessState", () => ({
    SamplingSuccessState: ({ summary }: { summary: string }) => <div>{summary}</div>,
}));

mock.module("../../components/SamplePreviewTable", () => ({
    SamplePreviewTable: () => <div>preview</div>,
}));

const { SamplingExecution } = await import("./SamplingExecution");

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    const dom = installDomGlobals("http://localhost/student/task/2/experiment");
    restoreDom = dom.restore;
    mockExperimentApi.getStats.mockClear();
    mockExperimentApi.executeSampling.mockClear();
    mockExperimentContext = {
        populationSize: 100,
        experiment: {
            id: 88,
            taskId: 2,
            currentStage: 3,
            samplePlan: {
                finalSampleSize: 13,
                confidenceLevel: "95",
                marginOfError: 5,
            },
            samplingResults: null,
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

test("SamplingExecution aborts obsolete stats requests on task changes and unmount", async () => {
    const view = render(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(1));
    const firstSignal = mockExperimentApi.getStats.mock.calls[0]![1];
    mockExperimentContext.experiment = { ...mockExperimentContext.experiment, taskId: 3 };
    view.rerender(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(2));
    const currentSignal = mockExperimentApi.getStats.mock.calls[1]![1];
    expect(firstSignal?.aborted).toBe(true);
    expect(currentSignal?.aborted).toBe(false);
    expect(currentSignal).not.toBe(firstSignal);
    view.unmount();
    expect(currentSignal?.aborted).toBe(true);
});

test("SamplingExecution restores zero seeds instead of switching to random execution", async () => {
    mockExperimentApi.getStats.mockResolvedValueOnce({ success: true, data: { stats: {}, numericFields: ["weight"], ppsEligibleFields: ["weight"] } });
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplingResults: {
            simple: { completed: true, sampleCount: 13, seed: 0, data: [] },
            systematic: { completed: true, sampleCount: 13, seed: 0, data: [] },
            pps: { completed: true, sampleCount: 13, seed: 0, sizeField: "weight", data: [] },
        },
    };
    const view = render(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(1));
    for (const method of ["simple", "systematic", "pps"]) {
        expect((view.getByTestId(`student-sampling-${method}-seed`) as HTMLInputElement).value).toBe("0");
    }
    expect(view.container.textContent).toContain("Seed 0");
});

test("SamplingExecution blocks the stage when sample plan is missing", async () => {
    mockExperimentContext.experiment = {
        id: 88,
        taskId: 2,
        currentStage: 3,
        samplePlan: null,
        samplingResults: null,
    };

    const view = render(<SamplingExecution onPrev={() => undefined} />);

    await waitFor(() => {
        expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(1);
    });

    expect(view.getByTestId("student-stage-sampling-blocked")).toBeTruthy();
    expect(view.container.textContent).toContain("无法开始抽样执行");
});

test("SamplingExecution always uses the desktop tabs and navigation", async () => {
    const view = render(<SamplingExecution onPrev={() => undefined} />);

    await waitFor(() => {
        expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(1);
    });

    expect(view.getByTestId("student-sampling-tab-simple").textContent).toContain("简单随机抽样");
    expect(view.getByTestId("student-sampling-tab-systematic").textContent).toContain("系统抽样");
    expect(view.getByTestId("student-sampling-tab-pps").textContent).toContain("PPS抽样");
    expect(view.getByTestId("student-sampling-tab-stratified").textContent).toContain("分层抽样");
    expect(view.container.textContent).toContain("与目标变量相关时 PPS 才更可能提高效率");
    expect(view.container.textContent).toContain("相关性弱时未必优于等概率设计");

    const next = view.getByTestId("student-sampling-next");
    expect(next.parentElement?.className).toContain("flex-row");
    expect(next.className).toContain("w-auto");
    expect(next.className).not.toContain("w-full");
});

test("SamplingExecution preserves a persisted completed PPS result while eligible fields load", async () => {
    let resolveStats: ((value: {
        success: true;
        data: { stats: Record<string, never>; numericFields: string[]; ppsEligibleFields: string[] };
    }) => void) | undefined;
    mockExperimentApi.getStats.mockImplementationOnce(() => new Promise((resolve) => {
        resolveStats = resolve;
    }));
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplingResults: {
            simple: { completed: true, sampleCount: 13, data: [] },
            systematic: { completed: true, sampleCount: 13, data: [] },
            pps: { completed: true, sampleCount: 13, sizeField: "weight", data: [] },
            stratified: { completed: true, sampleCount: 13, data: [], layers: [] },
        },
    };

    const view = render(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(1));
    resolveStats?.({
        success: true,
        data: { stats: {}, numericFields: ["weight"], ppsEligibleFields: ["weight"] },
    });

    await waitFor(() => {
        expect(view.getByTestId("student-sampling-next").textContent).toContain("完成本阶段");
    });
    expect(view.queryByTestId("student-sampling-pps-unavailable")).toBeNull();
    expect(view.container.textContent).toContain("本实验执行还要求该字段对总体每个单位均为正数");
});

test("SamplingExecution exposes stats failures, preserves PPS state, and retries", async () => {
    mockExperimentApi.getStats
        .mockResolvedValueOnce({ success: false, error: { code: "READ_FAILED", message: "总体文件暂不可用" } } as never)
        .mockResolvedValueOnce({
            success: true,
            data: { stats: {}, numericFields: ["weight"], ppsEligibleFields: ["weight"] },
        });
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplingResults: {
            pps: { completed: true, sampleCount: 13, sizeField: "weight", data: [] },
        },
    };

    const view = render(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect(view.getByTestId("student-sampling-stats-error")).toBeTruthy());
    expect(view.container.textContent).toContain("总体文件暂不可用");
    expect(view.queryByTestId("student-sampling-pps-unavailable")).toBeNull();

    fireEvent.click(view.getByTestId("student-sampling-stats-retry"));
    await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(view.queryByTestId("student-sampling-stats-error")).toBeNull());
    expect(view.queryByTestId("student-sampling-pps-unavailable")).toBeNull();
});

test("SamplingExecution caps the PPS range at the population and exposes invalid input accessibly", async () => {
    mockExperimentContext.populationSize = 12;
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplePlan: {
            finalSampleSize: 12,
            confidenceLevel: "95",
            marginOfError: 5,
        },
        samplingResults: {
            pps: { sampleCount: 13, sizeField: "income" },
        },
    };
    mockExperimentApi.getStats.mockResolvedValueOnce({
        success: true,
        data: {
            stats: {},
            numericFields: ["income"],
            ppsEligibleFields: ["income"],
        },
    });

    const view = render(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect(view.getByTestId("student-sampling-pps-sample-size")).toBeTruthy());

    const input = view.getByTestId("student-sampling-pps-sample-size") as HTMLInputElement;
    expect(input.min).toBe("10");
    expect(input.max).toBe("12");
    expect(view.container.textContent).toContain("有效范围: 10-12");
    expect(view.container.textContent).toContain("不能超过总体 N=12");
    expect(input.value).toBe("13");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(view.container.textContent).toContain("请输入 10-12 之间的整数");
    expect((view.getByTestId("student-sampling-pps-run") as HTMLButtonElement).disabled).toBe(true);
});

test("SamplingExecution marks PPS as unavailable when no numeric size field exists", async () => {
    mockExperimentApi.getStats.mockResolvedValueOnce({
        success: true,
        data: {
            stats: { gender: { 男: 50, 女: 50 } },
            numericFields: [],
            ppsEligibleFields: [],
        },
    });

    const view = render(<SamplingExecution onPrev={() => undefined} />);

    await waitFor(() => {
        expect(view.getByTestId("student-sampling-pps-unavailable")).toBeTruthy();
    });

    expect((view.getByTestId("student-sampling-pps-run") as HTMLButtonElement).disabled).toBe(true);
});

test("SamplingExecution displays the exact fractional systematic interval", async () => {
    mockExperimentContext.populationSize = 200;
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        samplePlan: {
            finalSampleSize: 132,
            confidenceLevel: "95",
            marginOfError: 5,
        },
    };
    const view = render(<SamplingExecution onPrev={() => undefined} />);

    await waitFor(() => {
        expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(1);
    });

    expect(view.getByTestId("student-sampling-systematic-k").textContent).toBe("1.5152");
    expect(view.container.textContent).not.toContain("没有任何 K 值");
});

test("SamplingExecution waits for the API result before showing the explanation animation", async () => {
    let resolveRequest: ((value: {
        success: true;
        data: { result: { completed: true; sampleCount: number; seed: number; data: Array<{ id: number }> } };
    }) => void) | undefined;
    mockExperimentApi.executeSampling.mockImplementationOnce(() => new Promise((resolve) => {
        resolveRequest = resolve;
    }));

    const view = render(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect(view.getByTestId("student-sampling-simple-run")).toBeTruthy());

    fireEvent.click(view.getByTestId("student-sampling-simple-run"));
    expect(mockExperimentApi.executeSampling).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId("mock-sampling-animation")).toBeNull();

    resolveRequest?.({
        success: true,
        data: {
            result: {
                completed: true,
                sampleCount: 13,
                seed: 42,
                data: [{ id: 1 }, { id: 2 }],
            },
        },
    });

    await waitFor(() => {
        expect(view.getByTestId("mock-sampling-animation").textContent).toContain("结果 2 条");
    });
    expect(mockExperimentApi.executeSampling).toHaveBeenCalledTimes(1);
});

test("SamplingExecution honors disabled methods and allows the required two-method choice", async () => {
    mockExperimentContext.experiment = {
        id: 88,
        taskId: 2,
        currentStage: 3,
        samplePlan: { finalSampleSize: 13, confidenceLevel: "95", marginOfError: 5 },
        samplingPolicy: {
            version: 1,
            methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "disabled" },
        },
        samplingResults: {
            simple: { completed: true, sampleCount: 13 },
            systematic: { completed: true, sampleCount: 13, interval: 100 / 13 },
        },
    };
    const view = render(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(1));
    expect(view.queryByTestId("student-sampling-tab-pps")).toBeNull();
    expect(view.queryByTestId("student-sampling-tab-stratified")).toBeNull();
    const complete = view.getByTestId("student-sampling-next") as HTMLButtonElement;
    expect(complete.disabled).toBeFalse();
    expect(complete.textContent).toContain("完成本阶段");
});

function prepareNeymanScenario(options: {
    numericFields?: string[];
    target?: AnalysisTarget | null;
    targetStdDevs?: [number, number];
    missingTargetStats?: boolean;
} = {}) {
    const numericFields = options.numericFields ?? ["constant", "y"];
    const targetStdDevs = options.targetStdDevs ?? [1, 10];
    const population = Array.from({ length: 200 }, (_, i) => ({
        group: i < 100 ? "A" : "B",
        constant: 1,
        auxiliary: (i % 2 ? 1 : -1) * (i < 100 ? 10 : 1),
        y: (i < 100 ? 10 : 20) + (i % 2 ? 1 : -1) * Math.sqrt(99 / 100) * targetStdDevs[i < 100 ? 0 : 1],
    }));
    const fieldMapping = { stratified: ["group"], numeric: numericFields };
    const stratumNumericStats = buildStratifiedNumericStats(population, fieldMapping);
    if (options.missingTargetStats) delete stratumNumericStats.group!.B!.y;
    mockExperimentContext.populationSize = 200;
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        analysisTarget: options.target === null ? null : {
            target: options.target ?? { kind: "mean", field: "y" },
            inferred: false,
        },
        samplePlan: { finalSampleSize: 30, confidenceLevel: "95", marginOfError: 5 },
    };
    mockExperimentApi.getStats.mockResolvedValueOnce({ success: true, data: {
        stats: buildStratifiedStats(population, fieldMapping), numericFields, ppsEligibleFields: [], stratumNumericStats,
    } });
}

for (const numericFields of [["constant", "y"], ["y", "constant"], ["auxiliary", "y"]]) {
    test(`Neyman quick allocation uses the research target with numeric order ${numericFields.join(",")}`, async () => {
        prepareNeymanScenario({ numericFields });
        const view = render(<SamplingExecution onPrev={() => undefined} />);
        const neyman = await waitFor(() => {
            const button = view.getByRole("button", { name: "奈曼" }) as HTMLButtonElement;
            expect(button.disabled).toBe(false);
            return button;
        });
        fireEvent.click(neyman);
        expect((view.getByRole("spinbutton", { name: "A层样本数" }) as HTMLInputElement).value).toBe("3");
        expect((view.getByRole("spinbutton", { name: "B层样本数" }) as HTMLInputElement).value).toBe("27");
        expect(neyman.getAttribute("title")).toContain("研究目标「y」");
    });
}

test("Neyman retains coverage for a zero-variance target stratum", async () => {
    prepareNeymanScenario({ targetStdDevs: [0, 10] });
    const view = render(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect((view.getByRole("button", { name: "奈曼" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(view.getByRole("button", { name: "奈曼" }));
    expect((view.getByRole("spinbutton", { name: "A层样本数" }) as HTMLInputElement).value).toBe("1");
    expect((view.getByRole("spinbutton", { name: "B层样本数" }) as HTMLInputElement).value).toBe("29");
});

test("Neyman remains available when every target stratum is constant", async () => {
    prepareNeymanScenario({ targetStdDevs: [0, 0] });
    const view = render(<SamplingExecution onPrev={() => undefined} />);
    await waitFor(() => expect((view.getByRole("button", { name: "奈曼" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(view.getByRole("button", { name: "奈曼" }));
    const counts = ["A", "B"].map(name => Number((view.getByRole("spinbutton", { name: `${name}层样本数` }) as HTMLInputElement).value));
    expect(counts.every(count => count >= 1)).toBe(true);
    expect(counts[0]! + counts[1]!).toBe(30);
});

for (const options of [
    { missingTargetStats: true },
    { target: null },
    { target: { kind: "proportion", field: "group", value: "B" } as AnalysisTarget },
]) {
    test(`Neyman does not substitute an auxiliary variable when target statistics are unavailable: ${JSON.stringify(options)}`, async () => {
        prepareNeymanScenario(options);
        const view = render(<SamplingExecution onPrev={() => undefined} />);
        const neyman = await waitFor(() => view.getByRole("button", { name: "奈曼" }) as HTMLButtonElement);
        expect(neyman.disabled).toBe(true);
        fireEvent.click(neyman);
        expect((view.getByRole("spinbutton", { name: "A层样本数" }) as HTMLInputElement).value).toBe("15");
        expect((view.getByRole("spinbutton", { name: "B层样本数" }) as HTMLInputElement).value).toBe("15");
        expect(neyman.getAttribute("title")).toContain("暂");
        expect(view.getByRole("button", { name: "对比分析全部方法" })).toBeTruthy();
    });
}
