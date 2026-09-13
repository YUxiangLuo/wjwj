import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { installDomGlobals } from "@/test-utils/dom";
import { researchFixture } from "@/test-utils/research-analysis";
import { ResearchAppendix } from "@/components/ResearchResult";

let restoreDom: (() => void) | null = null;
let ImmersiveReportPreviewContent: typeof import("./ImmersiveReportPreview").ImmersiveReportPreviewContent;

beforeAll(async () => {
    const dom = installDomGlobals("http://localhost/");
    restoreDom = dom.restore;
    ({ ImmersiveReportPreviewContent } = await import("./ImmersiveReportPreview"));
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    document.body.innerHTML = "";
});

afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("fullscreen exposes selected immutable results and does not replace them with a new computation", () => {
    const { run } = researchFixture();
    const view = render(<ImmersiveReportPreviewContent taskName="已保存实验" onClose={() => {}} analysisRuns={[run]} experiment={{ id: 9, taskId: 3, version: 7, currentStage: 4, status: "in_progress", analysisReferences: [run.id], populationSize: 4, questionnaire: null, samplePlan: null, samplingResults: null, reportContent: "学生解释" } as any} />);
    fireEvent.click(view.getByRole("button", { name: "分析附录" }));
    expect(view.getByTestId(`research-result-${run.id}`).textContent).toContain(run.spec.question);
    expect(view.getAllByText("2.500000")).toHaveLength(2);
});
test("a missing response appendix is visibly invalid, not silently an empty appendix", () => {
    const view = render(<ResearchAppendix runs={undefined as any} />);
    expect(view.getByRole("alert").textContent).toContain("不会自动补为空列表");
});
test("ImmersiveReportPreview shows persisted sample plan semantics in overview", async () => {
    const view = render(
        <ImmersiveReportPreviewContent
            analysisRuns={[]}
            taskName="抽样调查"
            onClose={() => undefined}
            experiment={{
                analysisReferences: [],
                id: 88,
                taskId: 2,
                version: 4,
                currentStage: 4,
                status: "in_progress",
                questionnaire: {
                    title: "问卷",
                    welcomeText: "<p>欢迎</p>",
                    endingText: "<p>结束</p>",
                    questions: [{ id: "q1", type: "single", content: "题目", options: [{ id: "o_1", label: "A" }, { id: "o_2", label: "B" }] }],
                },
                samplePlan: {
                    estimationType: "mean",
                    advancedPlanSource: "cv",
                    confidenceLevel: "95",
                    marginOfError: 2,
                    populationVariance: 100,
                    designEffect: 1.2,
                    nonResponseRate: 0.1,
                    recommendedSize: 95,
                    finalSampleSize: 110,
                },
                samplingResults: null,
                reportContent: "<p>报告</p>",
                stage1CompletedAt: null,
                stage2CompletedAt: null,
                stage3CompletedAt: null,
                stage4CompletedAt: null,
                populationSize: 8000,
            }}
        />,
    );

    await waitFor(() => {
        expect(view.getByText("样本量规划摘要")).toBeTruthy();
    });

    expect(view.getByRole("button", { name: "关闭全屏预览" })).toBeTruthy();

    const text = view.container.textContent ?? "";
    expect(text).toContain("最终样本量来源");
    expect(text).toContain("CV-based计算（高级工具）");
    // Analysis units are research-neutral, never assumed to be people.
    expect(text).toContain("8,000个单位");
    expect(text).not.toContain("8,000人");
});
