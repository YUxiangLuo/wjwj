import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { buildDefaultSamplingPolicy } from "@/lib/sampling-policy";
import type { FieldMappingState } from "./StudyContractEditor";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");

mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({ value }: { value: string }) => <div data-testid="mock-richtext">{value}</div>,
}));
mock.module("@/components/questionnaire/QuestionEditor", () => ({ QuestionEditor: () => null }));
mock.module("../api-client", () => ({ teacherApi: { deleteAttachment: async () => ({ success: true }) } }));

const { TopicWizardDialog } = await import("./TopicWizardDialog");
bootstrapDom.restore();

type Props = Parameters<typeof TopicWizardDialog>[0];

const completeMapping: FieldMappingState = {
    identifier: "id",
    stratified: [],
    numeric: ["score"],
    others: [],
    analysisTarget: { kind: "mean", field: "score" },
};

function makeProps(overrides: Partial<Props> = {}): Props {
    return {
        open: true,
        onOpenChange: () => undefined,
        editingTopicId: null,
        mode: "create",
        currentStep: 1,
        setCurrentStep: () => undefined,
        newTopicName: "咖啡馆调查",
        setNewTopicName: () => undefined,
        newTopicDesc: "",
        setNewTopicDesc: () => undefined,
        loadingDetail: false,
        excelInfo: null,
        uploadingExcel: false,
        onExcelUpload: () => undefined,
        columns: [],
        fieldMapping: { stratified: [], numeric: [], others: [] },
        setFieldMapping: () => undefined,
        attachments: [],
        uploadingAttachment: false,
        onAttachmentUpload: () => undefined,
        onRefreshTopicDetail: async () => undefined,
        recommendQuestions: [],
        setRecommendQuestions: () => undefined,
        weightConfig: { questionnaire: 30, process: 30, report: 40 },
        setWeightConfig: () => undefined,
        samplingPolicy: buildDefaultSamplingPolicy(),
        setSamplingPolicy: () => undefined,
        onSubmitTopic: () => undefined,
        onSaveFieldMapping: () => undefined,
        onSaveSamplingPolicy: () => undefined,
        onSaveRecommendQuestions: () => undefined,
        onSaveWeights: () => undefined,
        ...overrides,
    };
}

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("the title reflects create vs edit mode, not the draft state", () => {
    const create = render(<TopicWizardDialog {...makeProps({ mode: "create", editingTopicId: 12 })} />);
    expect(create.getByRole("heading", { name: "创建实验模板" })).toBeTruthy();
    create.unmount();

    const edit = render(<TopicWizardDialog {...makeProps({ mode: "edit", editingTopicId: 12 })} />);
    expect(edit.getByRole("heading", { name: "编辑实验模板" })).toBeTruthy();
});

test("step 1 submits via onSubmitTopic and labels the button by draft state", () => {
    const onSubmitTopic = mock(() => undefined);
    const view = render(<TopicWizardDialog {...makeProps({ onSubmitTopic })} />);

    const next = view.getByTestId("teacher-topic-next");
    expect(next.textContent).toBe("下一步");
    fireEvent.click(next);
    expect(onSubmitTopic).toHaveBeenCalledTimes(1);

    view.unmount();
    const editing = render(<TopicWizardDialog {...makeProps({ editingTopicId: 12, onSubmitTopic })} />);
    expect(editing.getByTestId("teacher-topic-next").textContent).toBe("保存并继续");
});

test("step 2 requires an uploaded population before continuing", () => {
    const blocked = render(<TopicWizardDialog {...makeProps({ currentStep: 2, excelInfo: null })} />);
    expect((blocked.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(true);
    blocked.unmount();

    const ready = render(<TopicWizardDialog {...makeProps({
        currentStep: 2,
        excelInfo: { rowCount: 80, colCount: 3, columns: ["id", "score", "gender"], preview: [{ id: "1", score: 10, gender: "女" }] },
    })} />);
    expect((ready.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false);
    expect(ready.getByText(/已解析：80 行/)).toBeTruthy();
});

test("step 3 blocks until identifier and study target are set", () => {
    const blocked = render(<TopicWizardDialog {...makeProps({ currentStep: 3, fieldMapping: { stratified: [], numeric: [], others: [] } })} />);
    expect((blocked.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(true);
    blocked.unmount();

    const ready = render(<TopicWizardDialog {...makeProps({ currentStep: 3, fieldMapping: completeMapping })} />);
    expect((ready.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false);
});

test("step 3 warns that a small population is unsuitable for method comparison", () => {
    const view = render(<TopicWizardDialog {...makeProps({
        currentStep: 3,
        fieldMapping: completeMapping,
        excelInfo: { rowCount: 30, colCount: 3, columns: ["id", "score", "gender"], preview: [] },
    })} />);

    expect(view.getByTestId("teacher-topic-small-population-notice").textContent).toContain("总体只有 30 个单位");
});

test("step 4 blocks an incoherent sampling policy and unblocks once resolved", () => {
    const blocked = render(<TopicWizardDialog {...makeProps({ currentStep: 4, fieldMapping: completeMapping })} />);
    // Default policy keeps PPS optional with no eligible size field.
    expect((blocked.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(true);
    blocked.unmount();

    const policy = buildDefaultSamplingPolicy();
    policy.methods.pps = "disabled";
    policy.methods.stratified = "disabled";
    const ready = render(<TopicWizardDialog {...makeProps({ currentStep: 4, fieldMapping: completeMapping, samplingPolicy: policy })} />);
    expect((ready.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false);
});

test("a published topic is read-only and always allows advancing", async () => {
    const view = render(<TopicWizardDialog {...makeProps({
        currentStep: 3,
        isPublishedTopic: true,
        fieldMapping: { stratified: [], numeric: [], others: [] },
        excelInfo: { rowCount: 10, colCount: 2, columns: ["id", "score"], preview: [] },
    })} />);

    expect(view.getByText(/研究目标与字段不可修改/)).toBeTruthy();
    expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false);
    await waitFor(() => expect(view.getByTestId("teacher-topic-next").textContent).toBe("下一步"));
});
