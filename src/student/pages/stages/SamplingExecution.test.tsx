import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";

const mockExperimentApi = {
    getStats: mock(async () => ({
        success: true,
        data: {
            stats: {},
            numericFields: [],
        },
    })),
    executeSampling: mock(async () => ({ success: true, data: { result: null } })),
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
    ImmersiveSamplingAnimation: () => null,
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

mock.module("../../components/StratifiedSamplingTab", () => ({
    StratifiedSamplingTab: () => <div>stratified</div>,
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

test("SamplingExecution marks PPS as unavailable when no numeric size field exists", async () => {
    mockExperimentApi.getStats.mockResolvedValueOnce({
        success: true,
        data: {
            stats: { gender: { 男: 50, 女: 50 } },
            numericFields: [],
        },
    });

    const view = render(<SamplingExecution onPrev={() => undefined} />);

    await waitFor(() => {
        expect(view.getByTestId("student-sampling-pps-unavailable")).toBeTruthy();
    });

    expect((view.getByTestId("student-sampling-pps-run") as HTMLButtonElement).disabled).toBe(true);
});

test("SamplingExecution chooses the best valid default K for systematic sampling", async () => {
    const view = render(<SamplingExecution onPrev={() => undefined} />);

    await waitFor(() => {
        expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(1);
    });

    const input = view.getByTestId("student-sampling-systematic-k") as HTMLInputElement;

    expect(input.value).toBe("8");
});
