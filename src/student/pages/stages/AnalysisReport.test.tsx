import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { installDomGlobals } from "@/test-utils/dom";
import { createReportDraftBasis, getReportDraftKey } from "../../draft-sync";

const mockExperimentApi = {
    getStats: mock(async () => ({
        success: true,
        data: {
            stats: {},
        },
    })),
};

let mockExperimentContext: {
    experiment: Record<string, unknown> | null;
    registerStageSave: (saveHandler: (() => Promise<boolean>) | null) => void;
    saveExperiment: (payload: unknown) => Promise<boolean>;
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
    mockExperimentApi.getStats.mockClear();
    mockExperimentContext = {
        experiment: {
            id: 88,
            taskId: 2,
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
        registerStageSave: () => undefined,
        saveExperiment: async () => true,
    };
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    localStorage.clear();
    restoreDom?.();
    restoreDom = null;
});

test("AnalysisReport restores a valid local report draft before persistence clears it", async () => {
    const experiment = mockExperimentContext.experiment as NonNullable<typeof mockExperimentContext.experiment>;
    const draftContent = "<p>本地未提交报告草稿。</p>";
    const draftKey = getReportDraftKey(Number(experiment.id));
    const draftBasis = createReportDraftBasis({
        samplePlan: experiment.samplePlan,
        samplingResults: experiment.samplingResults,
    });

    localStorage.setItem(draftKey, JSON.stringify({
        basis: draftBasis,
        content: draftContent,
    }));

    const view = render(
        <AnalysisReport onPrev={() => undefined} onSubmit={() => undefined} />
    );

    await waitFor(() => {
        expect(view.getByTestId("student-analysis-draft-restored")).toBeTruthy();
    });

    expect(view.getByTestId("student-analysis-report-editor").innerHTML).toBe(draftContent);
    expect(localStorage.getItem(draftKey)).not.toBeNull();
    expect(mockExperimentApi.getStats).toHaveBeenCalledTimes(1);
});
