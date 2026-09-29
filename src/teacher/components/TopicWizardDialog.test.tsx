import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { installDomGlobals } from "@/test-utils/dom";
import { buildDefaultSamplingPolicy } from "@/lib/sampling-policy";
import type { FieldMappingState } from "./StudyContractEditor";

const bootstrapDom = installDomGlobals();
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");

mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({ value }: { value: string }) => <div data-testid="mock-richtext">{value}</div>,
}));
mock.module("@/components/questionnaire/QuestionEditor", () => ({ QuestionEditor: () => null }));
mock.module("../api-client", () => ({ teacherApi: {
    deleteAttachment: async () => ({ success: true }),
    getVariableDictionary: async () => ({ success: true, data: {
        source: "fixture", revision: 1, locked: false,
        dictionary: { source: "fixture", revision: 1, variables: [{ field: "score", label: "分数", unit: "", kind: "continuous", categories: [], missing: [] }] },
    } }),
} }));

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

test("CSV replacement waits for local preview confirmation before calling upload", async () => {
    const upload = mock((_file: File) => {});
    const view = render(<TopicWizardDialog {...makeProps({ currentStep: 2, onExcelUpload: upload })} />);
    fireEvent.change(view.getByTestId("teacher-topic-excel-file"), { target: { files: [new File(["编号,等待分钟\n0001,10\n"], "population.csv")] } });
    await view.findByText("0001");
    expect(upload).not.toHaveBeenCalled();
    fireEvent.click(view.getByTestId("csv-review-confirm"));
    expect(upload).toHaveBeenCalledTimes(1);
    expect([...new Uint8Array(await upload.mock.calls[0]![0].arrayBuffer()).slice(0, 3)]).toEqual([239, 187, 191]);
});

test("XLSX upload keeps the existing binary workbook path without CSV encoding review", () => {
    const upload = mock((_file: File) => {});
    const view = render(<TopicWizardDialog {...makeProps({ currentStep: 2, onExcelUpload: upload })} />);
    const file = new File(["workbook fixture"], "population.xlsx");
    fireEvent.change(view.getByTestId("teacher-topic-excel-file"), { target: { files: [file] } });
    expect(upload).toHaveBeenCalledWith(file);
    expect(view.queryByTestId("csv-file-review")).toBeNull();
});

test("non-stratified categories are selectable and roles remain exclusive", () => {
    let mapping: FieldMappingState = { ...completeMapping, stratified: ["cat"] };
    const props = makeProps({ currentStep: 3, columns: ["id", "score", "cat"], fieldMapping: mapping,
        setFieldMapping: update => { mapping = typeof update === "function" ? update(mapping) : update; },
    });
    const view = render(<TopicWizardDialog {...props} />);
    fireEvent.click(view.getByTestId("teacher-topic-mapping-others-cat"));
    expect(mapping.others).toEqual(["cat"]);
    expect(mapping.stratified).toEqual([]);
    view.rerender(<TopicWizardDialog {...props} fieldMapping={mapping} />);
    fireEvent.click(view.getByTestId("teacher-topic-mapping-numeric-cat"));
    expect(mapping.others).toEqual([]);
    expect(mapping.numeric).toContain("cat");
});

test("ID-like field names warn but do not prohibit valid grouping", () => {
    let mapping = completeMapping;
    const view = render(<TopicWizardDialog {...makeProps({ currentStep: 3, columns: ["id", "region_id", "score"],
        fieldMapping: mapping, setFieldMapping: update => { mapping = typeof update === "function" ? update(mapping) : update; },
    })} />);
    const input = view.getByTestId("teacher-topic-mapping-stratified-region_id") as HTMLInputElement;
    expect(input.disabled).toBe(false);
    fireEvent.click(input);
    expect(mapping.stratified).toEqual(["region_id"]);
    expect((view.getByTestId("teacher-topic-mapping-stratified-id") as HTMLInputElement).disabled).toBe(true);
});

for (const eligible of [true, false]) {
    test(`PPS wizard uses full-population eligibility (${eligible}), not formatted/truncated previews`, () => {
        const policy = buildDefaultSamplingPolicy();
        policy.methods.pps = "required";
        policy.methods.stratified = "disabled";
        const view = render(<TopicWizardDialog {...makeProps({ currentStep: 4, samplingPolicy: policy,
            fieldMapping: { ...completeMapping, numeric: ["score", "size"] },
            excelInfo: { rowCount: 40, colCount: 3, columns: ["id", "score", "size"],
                preview: [{ size: eligible ? "¥1,200.00" : "1200" }], ppsEligibleFields: eligible ? ["size"] : [] },
        })} />);
        expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(!eligible);
    });
}

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
        columns: ["id", "cat"],
        fieldMapping: { stratified: [], numeric: [], others: [] },
        excelInfo: { rowCount: 10, colCount: 2, columns: ["id", "score"], preview: [] },
    })} />);

    expect(view.getByText(/研究目标与字段不可修改/)).toBeTruthy();
    expect((view.getByTestId("teacher-topic-mapping-others-cat") as HTMLInputElement).disabled).toBe(true);
    expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false);
    await waitFor(() => expect(view.getByTestId("teacher-topic-next").textContent).toBe("下一步"));
});

test("changing steps resets scrolling and focuses the step, but editing does not", () => {
    const props = makeProps({ currentStep: 2 });
    const view = render(<TopicWizardDialog {...props} />);
    const content = view.getByTestId("teacher-topic-scroll-content");
    content.scrollTop = 368;
    view.rerender(<TopicWizardDialog {...props} newTopicName="修改名称" />);
    expect(content.scrollTop).toBe(368);
    view.rerender(<TopicWizardDialog {...props} currentStep={3} />);
    expect(content.scrollTop).toBe(0);
    expect(document.activeElement).toBe(view.getByTestId("teacher-topic-step-3"));
    expect(document.activeElement?.getAttribute("aria-current")).toBe("step");
    // 步骤圆点是通用 div，禁止使用 aria-label（axe: aria-prohibited-attr）；
    // 可读名称来自紧邻的可见步骤文字。
    expect(view.container.querySelector('[aria-label^="步骤"]')).toBeNull();
    expect(view.getByTestId("teacher-topic-step-3").textContent).toBe("3");
});

test("the introductory flow is optional instead of pushing the first fields down", () => {
    const view = render(<TopicWizardDialog {...makeProps()} />);
    const help = view.getByText("实验模板如何生成学生实验").closest("details")!;
    expect(help.open).toBe(false);
    expect(view.getByText("完成七步配置并发布模板后，再分配到班级。")).toBeTruthy();
});

test("pending saves prevent duplicate requests, field edits and closing", async () => {
    let finish!: () => void;
    const save = mock(() => new Promise<void>(resolve => { finish = resolve; }));
    const close = mock(() => {});
    const view = render(<TopicWizardDialog {...makeProps({ onSubmitTopic: save, onOpenChange: close })} />);
    const next = view.getByTestId("teacher-topic-next") as HTMLButtonElement;
    fireEvent.click(next); fireEvent.click(next);
    expect(save).toHaveBeenCalledTimes(1);
    expect(next.disabled).toBe(true);
    expect(view.getByText(/正在保存/)).toBeTruthy();
    expect(view.getByRole("dialog").querySelector('[aria-busy="true"]')?.hasAttribute("inert")).toBe(true);
    expect(view.queryByRole("button", { name: "关闭" })).toBeNull();
    fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(next.disabled).toBe(false);
});

test("unexpected save failure leaves the wizard open and permits retry", async () => {
    const save = mock(async () => { throw Error("offline"); });
    const view = render(<TopicWizardDialog {...makeProps({ onSubmitTopic: save })} />);
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect(view.getByTestId("teacher-topic-save-error").textContent).toContain("本页输入已保留"));
    expect(document.activeElement).toBe(view.getByTestId("teacher-topic-save-error"));
    expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
});

test("server errors receive focus without discarding the current step or input", () => {
    const props = makeProps({ editingTopicId: 7, mode: "edit" });
    const view = render(<TopicWizardDialog {...props} />);
    view.rerender(<TopicWizardDialog {...props} saveError="模板名称已存在，请修改名称" />);
    expect(document.activeElement).toBe(view.getByTestId("teacher-topic-save-error"));
    expect((view.getByLabelText("实验模板名称") as HTMLInputElement).value).toBe("咖啡馆调查");
    expect(view.getByTestId("teacher-topic-step-1").getAttribute("aria-current")).toBe("step");
    view.rerender(<TopicWizardDialog {...props} saveError={null} />);
    expect(view.queryByTestId("teacher-topic-save-error")).toBeNull();
});

test("uploading blocks step changes until population processing finishes", () => {
    const view = render(<TopicWizardDialog {...makeProps({ currentStep: 2, uploadingExcel: true, isPublishedTopic: false,
        excelInfo: { rowCount: 10, colCount: 1, columns: ["id"], preview: [] } })} />);
    expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByTestId("teacher-topic-prev") as HTMLButtonElement).disabled).toBe(true);
    expect(view.getByText(/正在上传…/)).toBeTruthy();
});

test("changed weights require confirmation on back and restore the saved values only when accepted", () => {
    const back = mock(() => {});
    const restore = mock(() => {});
    const props = makeProps({ currentStep: 7, setCurrentStep: back, setWeightConfig: restore });
    const view = render(<TopicWizardDialog {...props} />);
    const confirm = mock(() => false);
    window.confirm = confirm;
    view.rerender(<TopicWizardDialog {...props} weightConfig={{ questionnaire: 20, process: 35, report: 45 }} />);
    fireEvent.click(view.getByTestId("teacher-topic-prev"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(view.getByTestId("teacher-topic-prev"));
    expect(restore).toHaveBeenCalledWith({ questionnaire: 30, process: 30, report: 40 });
    expect(back).toHaveBeenCalledTimes(1);
});

test("close and unload protect changed input but not edits reverted to the loaded value", () => {
    const close = mock(() => {});
    const props = makeProps({ editingTopicId: 7, onOpenChange: close });
    const view = render(<TopicWizardDialog {...props} />);
    const confirm = mock(() => false);
    window.confirm = confirm;
    view.rerender(<TopicWizardDialog {...props} newTopicName="修改后的名称" />);
    const unloading = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unloading);
    expect(unloading.defaultPrevented).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "关闭" }));
    expect(close).not.toHaveBeenCalled();
    view.rerender(<TopicWizardDialog {...props} />);
    const cleanUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
    fireEvent.click(view.getByRole("button", { name: "关闭" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledWith(false);
});

test("mapping save cannot silently discard independent dictionary edits", async () => {
    const save = mock(() => {});
    const props = makeProps({ editingTopicId: 7, currentStep: 3, fieldMapping: completeMapping, columns: ["id", "score"], onSaveFieldMapping: save });
    const view = render(<TopicWizardDialog {...props} />);
    const label = await view.findByLabelText("score 标签");
    const dictionary = view.getByTestId("teacher-variable-dictionary") as HTMLDetailsElement;
    expect(dictionary.open).toBe(false);
    dictionary.open = true;
    fireEvent.change(label, { target: { value: "满意度得分" } });
    dictionary.open = false;
    expect(view.getByTestId("teacher-variable-dictionary-toggle").textContent).toContain("未保存");
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    expect(dictionary.open).toBe(true);
    expect(save).not.toHaveBeenCalled();
    expect(view.getByTestId("teacher-topic-save-error").textContent).toContain("变量字典有未保存的修改");
    expect((label as HTMLInputElement).value).toBe("满意度得分");
    fireEvent.change(label, { target: { value: "分数" } });
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
});

for (const kind of ["mean", "proportion"] as const) test(`${kind}: target selection precedes research text without changing existing values`, () => {
    const target = kind === "mean" ? { kind, field: "score" } : { kind, field: "group", value: "A" };
    const contract = { version: 1 as const, target, researchQuestion: "教师自定义的研究问题", targetPopulation: "本校全体学生", unitOfAnalysis: "一名学生" };
    const view = render(<TopicWizardDialog {...makeProps({
        currentStep: 3,
        fieldMapping: { ...completeMapping, others: ["group"], analysisTarget: target, studyContract: contract },
        excelInfo: { rowCount: 120, colCount: 3, columns: ["id", "score", "group"], preview: [], columnValues: { group: ["A", "B"] } },
    })} />);
    const question = view.getByTestId("teacher-contract-question") as HTMLTextAreaElement;
    const field = view.getByTestId(kind === "mean" ? "teacher-topic-analysis-field" : "teacher-topic-analysis-value");
    expect(field.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(question.value).toBe("教师自定义的研究问题");
    expect((view.getByTestId("teacher-contract-population") as HTMLInputElement).value).toBe("本校全体学生");
});

test("missing numeric roles explain the prerequisite and disable the mean option", () => {
    const view = render(<TopicWizardDialog {...makeProps({ currentStep: 3 })} />);
    expect(view.getByText(/均值需先在上方选择数值变量/)).toBeTruthy();
    fireEvent.click(view.getByTestId("teacher-topic-analysis-kind"));
    expect(view.getByRole("option", { name: "均值" }).getAttribute("aria-disabled")).toBe("true");
    expect((view.getByTestId("teacher-contract-question") as HTMLTextAreaElement).disabled).toBe(true);
});

test("server hydration is clean, but a failed save does not clear unsaved changes", async () => {
    const back = mock(() => {});
    const save = mock(async () => { throw new Error("offline"); });
    const props = makeProps({ currentStep: 7, setCurrentStep: back, onSaveWeights: save });
    const view = render(<TopicWizardDialog {...props} loadingDetail />);
    const loaded = { questionnaire: 20, process: 35, report: 45 };
    view.rerender(<TopicWizardDialog {...props} weightConfig={loaded} />);
    const confirm = mock(() => false);
    window.confirm = confirm;
    fireEvent.click(view.getByTestId("teacher-topic-prev"));
    expect(back).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    view.rerender(<TopicWizardDialog {...props} weightConfig={{ questionnaire: 25, process: 35, report: 40 }} />);
    fireEvent.click(view.getByTestId("teacher-topic-finish"));
    await view.findByTestId("teacher-topic-save-error");
    fireEvent.click(view.getByTestId("teacher-topic-prev"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(back).toHaveBeenCalledTimes(1);
});

test("editing jumps directly without saving or implying earlier sections are complete", () => {
    const jump = mock(() => {});
    const save = mock(() => {});
    const props = makeProps({ mode: "edit", editingTopicId: 7, setCurrentStep: jump, onSubmitTopic: save });
    const view = render(<TopicWizardDialog {...props} />);
    fireEvent.click(view.getByRole("button", { name: "编辑评分规则" }));
    expect(jump).toHaveBeenCalledWith(7);
    expect(save).not.toHaveBeenCalled();
    view.rerender(<TopicWizardDialog {...props} currentStep={7} />);
    expect(view.getByTestId("teacher-topic-step-1").textContent).toBe("1");
    expect(view.getByTestId("teacher-topic-step-1").querySelector("svg")).toBeNull();
    view.rerender(<TopicWizardDialog {...props} mode="create" />);
    expect(view.queryByTestId("teacher-topic-jump-7")).toBeNull();
});

test("jumping from basic information confirms discard and restores both fields", () => {
    const jump = mock(() => {});
    const name = mock(() => {});
    const description = mock(() => {});
    const props = makeProps({ mode: "edit", editingTopicId: 7, setCurrentStep: jump, setNewTopicName: name, setNewTopicDesc: description });
    const view = render(<TopicWizardDialog {...props} />);
    const confirm = mock(() => false);
    window.confirm = confirm;
    view.rerender(<TopicWizardDialog {...props} newTopicName="尚未保存" newTopicDesc="新的背景" />);
    fireEvent.click(view.getByTestId("teacher-topic-jump-6"));
    expect(jump).not.toHaveBeenCalled();
    expect(name).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(view.getByTestId("teacher-topic-jump-6"));
    expect(name).toHaveBeenCalledWith("咖啡馆调查");
    expect(description).toHaveBeenCalledWith("");
    expect(jump).toHaveBeenCalledWith(6);
});

test("field search filters long lists without changing roles or the research target", () => {
    const update = mock(() => {});
    const columns = ["id", "score", "Area", "category", ...Array.from({ length: 60 }, (_, i) => `extra_${i}`)];
    const props = makeProps({ currentStep: 3, columns, fieldMapping: { ...completeMapping, stratified: ["Area"], others: ["category"] }, setFieldMapping: update });
    const view = render(<TopicWizardDialog {...props} />);
    fireEvent.change(view.getByLabelText("查找字段"), { target: { value: " AREA " } });
    expect(view.getByTestId("teacher-topic-mapping-stratified-Area")).toBeTruthy();
    expect(view.queryByTestId("teacher-topic-mapping-numeric-score")).toBeNull();
    expect(view.getByTestId("teacher-topic-analysis-field").textContent).toContain("score");
    fireEvent.change(view.getByLabelText("查找字段"), { target: { value: "missing" } });
    expect(view.getAllByText("没有符合条件的字段")).toHaveLength(3);
    fireEvent.click(view.getByText("显示全部字段"));
    expect((view.getByTestId("teacher-topic-mapping-numeric-score") as HTMLInputElement).checked).toBe(true);
    expect(view.getByTestId("teacher-topic-mapping-others-extra_59")).toBeTruthy();
    fireEvent.click(view.getByLabelText("仅看已选"));
    expect(view.queryByTestId("teacher-topic-mapping-numeric-Area")).toBeNull();
    expect(view.queryByTestId("teacher-topic-mapping-others-extra_59")).toBeNull();
    expect((view.getByTestId("teacher-topic-mapping-stratified-Area") as HTMLInputElement).checked).toBe(true);
    expect((view.getByTestId("teacher-topic-mapping-others-category") as HTMLInputElement).checked).toBe(true);
    expect(update).not.toHaveBeenCalled();
    view.rerender(<TopicWizardDialog {...props} open={false} />);
    view.rerender(<TopicWizardDialog {...props} />);
    expect((view.getByLabelText("仅看已选") as HTMLInputElement).checked).toBe(false);
    expect(view.getByTestId("teacher-topic-mapping-others-extra_59")).toBeTruthy();
});

test("jump navigation respects missing population, load failures and ongoing saves", async () => {
    const props = makeProps({ mode: "edit", editingTopicId: 7 });
    const view = render(<TopicWizardDialog {...props} />);
    expect((view.getByTestId("teacher-topic-jump-3") as HTMLButtonElement).disabled).toBe(true);
    expect((view.getByTestId("teacher-topic-jump-6") as HTMLButtonElement).disabled).toBe(false);
    view.rerender(<TopicWizardDialog {...props} detailError="加载失败" />);
    expect((view.getByTestId("teacher-topic-jump-6") as HTMLButtonElement).disabled).toBe(true);
    let finish!: () => void;
    view.rerender(<TopicWizardDialog {...props} onSubmitTopic={() => new Promise<void>(resolve => { finish = resolve; })} />);
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    expect((view.getByTestId("teacher-topic-jump-7") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish());
    expect((view.getByTestId("teacher-topic-jump-7") as HTMLButtonElement).disabled).toBe(false);
});
