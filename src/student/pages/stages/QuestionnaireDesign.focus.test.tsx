import { afterEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import type { ExperimentData } from "@/domain/experiment/types";

let mockExperimentContext: {
    experiment: ExperimentData | null;
    populationSize: number;
    isSaving: boolean;
    refreshRequired: boolean;
    requireRefresh: () => void;
    updateExperiment: (next: ExperimentData) => void;
    reloadExperiment: () => Promise<void>;
    completeStage: (stage: number, data: Record<string, unknown>) => Promise<boolean>;
};

mock.module("../ExperimentLayout", () => ({
    useExperiment: () => mockExperimentContext,
}));

mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({ id, value, onChange }: { id?: string; value: string; onChange: (val: string) => void }) => (
        <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    ),
}));

const bootstrapDom = installDomGlobals("http://localhost/student/task/1/experiment");
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { QuestionnaireDesign } = await import("./QuestionnaireDesign");
bootstrapDom.restore();

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals> | null = null;

afterEach(async () => {
    cleanup();
    localStorage.clear();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    dom?.restore();
    dom = null;
});

test("confirming question deletion in Stage 1 QuestionnaireDesign restores focus to '添加题目' button instead of document.body", async () => {
    dom = installDomGlobals("http://localhost/student/task/1/experiment");
    localStorage.clear();
    globalThis.fetch = (async () => Response.json({ success: true, data: { dictionary: null, recommendQuestions: [] } })) as unknown as typeof fetch;

    mockExperimentContext = {
        experiment: {
            id: 21,
            taskId: 1,
            version: 1,
            currentStage: 1,
            status: "in_progress",
            questionnaire: {
                title: "调研问卷",
                welcomeText: "<p>欢迎参与本次商业统计调研问卷，数据仅用于教学分析。</p>",
                endingText: "<p>感谢您的参与与支持，祝您生活愉快！</p>",
                questions: [
                    { id: "q1", type: "boolean", content: "第一题内容" },
                    { id: "q2", type: "boolean", content: "待删除第二题" },
                ],
            },
            samplePlan: null,
            samplingResults: null,
            reportContent: null,
            stage1CompletedAt: null,
            stage2CompletedAt: null,
            stage3CompletedAt: null,
            stage4CompletedAt: null,
            populationSize: 500,
        },
        populationSize: 500,
        isSaving: false,
        refreshRequired: false,
        requireRefresh: () => undefined,
        updateExperiment: () => undefined,
        reloadExperiment: async () => undefined,
        completeStage: async () => true,
    };

    const view = render(<QuestionnaireDesign />);
    fireEvent.click(view.getByTestId("student-questionnaire-step-2"));

    const deleteBtn = await view.findByTestId("student-questionnaire-delete-q2");
    deleteBtn.focus();
    fireEvent.click(deleteBtn);

    const confirmBtn = await view.findByTestId("student-questionnaire-delete-confirm");
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(view.queryByText("待删除第二题") === null).toBe(true));
    const addQuestionBtn = view.getByTestId("student-questionnaire-add-question");
    await waitFor(() => expect(document.activeElement === addQuestionBtn).toBe(true));
});
