import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { ComponentProps, ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import { buildStratifiedNumericStats, buildStratifiedStats } from "@/domain/statistics/population";

// Smoke coverage for the sampling stage: request lifecycle, stage gating,
// method policy, PPS availability, and the research-target link into Neyman
// allocation. Fine-grained DOM/text assertions live in the components they
// describe and are intentionally not duplicated here.

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");

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
bootstrapDom.restore();

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
    view.unmount();
    expect(currentSignal?.aborted).toBe(true);
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
        expect(view.getByTestId("mock-sampling-animation")).toBeTruthy();
    });
    expect(mockExperimentApi.executeSampling).toHaveBeenCalledTimes(1);
});

test("SamplingExecution honors disabled methods and the required-method policy", async () => {
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
    expect((view.getByTestId("student-sampling-next") as HTMLButtonElement).disabled).toBeFalse();
});

test("SamplingExecution feeds the research target into Neyman allocation", async () => {
    const population = Array.from({ length: 200 }, (_, i) => ({
        group: i < 100 ? "A" : "B",
        constant: 1,
        auxiliary: (i % 2 ? 1 : -1) * (i < 100 ? 10 : 1),
        y: (i < 100 ? 10 : 20) + (i % 2 ? 1 : -1) * Math.sqrt(99 / 100) * (i < 100 ? 1 : 10),
    }));
    const fieldMapping = { stratified: ["group"], numeric: ["constant", "y"] };
    mockExperimentContext.populationSize = 200;
    mockExperimentContext.experiment = {
        ...mockExperimentContext.experiment,
        analysisTarget: { target: { kind: "mean", field: "y" }, inferred: false },
        samplePlan: { finalSampleSize: 30, confidenceLevel: "95", marginOfError: 5 },
    };
    mockExperimentApi.getStats.mockResolvedValueOnce({
        success: true,
        data: {
            stats: buildStratifiedStats(population, fieldMapping),
            numericFields: ["constant", "y"],
            ppsEligibleFields: [],
            stratumNumericStats: buildStratifiedNumericStats(population, fieldMapping),
        },
    });

    const view = render(<SamplingExecution onPrev={() => undefined} />);
    const neyman = await waitFor(() => {
        const button = view.getByRole("button", { name: "奈曼" }) as HTMLButtonElement;
        expect(button.disabled).toBe(false);
        return button;
    });
    fireEvent.click(neyman);
    expect((view.getByRole("spinbutton", { name: "A层样本数" }) as HTMLInputElement).value).toBe("3");
    expect((view.getByRole("spinbutton", { name: "B层样本数" }) as HTMLInputElement).value).toBe("27");
});
