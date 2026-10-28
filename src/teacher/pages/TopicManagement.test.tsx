import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { Topic, TopicDetail, VariableDictionaryResponse } from "../api-client";
import type { VariableDictionary } from "@/domain/variables/types";
import type { FieldMappingState } from "../components/StudyContractEditor";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

const toastError = mock(() => undefined);
const toastSuccess = mock(() => undefined);
const copyTopic = mock(async (_id: number): Promise<{ success: boolean; data?: { id: number }; error?: { code: string; message: string } }> => ({ success: true, data: { id: 44 } }));
mock.module("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

const getTopics = mock(async () => ({ success: true, data: [] as Topic[] }));
const updateTopic = mock(async (_id: number, _body: unknown) => ({ success: true }));
const checkTopicPublish = mock(async (_id: number): Promise<{ success: boolean; error?: { code: string; message: string } }> => ({ success: true }));
const deleteTopic = mock(async (_id: number) => ({ success: true }));
const createTopic = mock(async (_body: unknown): Promise<{ success: boolean; data?: { id: number }; error?: { code: string; message: string } }> => ({ success: true, data: { id: 44 } }));
type ApiResult<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
const emptyDetail = (): ApiResult<TopicDetail> => ({ success: true, data: { topic: null, hasExcelFile: false, attachments: [], recommendQuestions: [] } });
const getTopicDetail = mock(async (_id: number): Promise<ApiResult<TopicDetail>> => emptyDetail());
const updateFieldMapping = mock(async (_id: number, _mapping: FieldMappingState): Promise<ApiResult<{ success: boolean }>> => ({ success: true, data: { success: true } }));
const getVariableDictionary = mock(async (_id: number): Promise<ApiResult<VariableDictionaryResponse>> => ({ success: false }));
const updateVariableDictionary = mock(async (_id: number, _body: { source: string; observedRevision: number; dictionary: VariableDictionary }): Promise<ApiResult<{ success: boolean; revision: number }>> => ({ success: false }));
const realClient = await import("../api-client");
mock.module("../api-client", () => ({
    ...realClient,
    teacherApi: {
        ...realClient.teacherApi,
        getTopics,
        updateTopic,
        checkTopicPublish,
        deleteTopic,
        createTopic,
        getTopicDetail,
        updateFieldMapping,
        getVariableDictionary,
        updateVariableDictionary,
        uploadTopicExcel: async () => ({ success: true, data: { rowCount: 0, columns: [], preview: [] } }),
        copyTopic,
    },
}));
mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({ value }: { value: string }) => <div data-testid="mock-richtext">{value}</div>,
}));
mock.module("@/components/questionnaire/QuestionEditor", () => ({ QuestionEditor: () => null }));

const { TopicManagement } = await import("./TopicManagement");
const { TeacherIdContext } = await import("../teacher-draft");
bootstrapDom.restore();

const draft: Topic = { id: 1, name: "咖啡馆调查", description: null, status: 0, dataRows: 80, hasTasks: false, createdAt: "2026-09-01T00:00:00.000Z" };
const assigned: Topic = { id: 2, name: "阅读时长调查", description: "已分配", status: 1, dataRows: 24, hasTasks: true, createdAt: "2026-09-02T00:00:00.000Z" };
const published: Topic = { id: 3, name: "毕业生就业比例", description: null, status: 1, dataRows: 160, hasTasks: false, createdAt: "2026-09-03T00:00:00.000Z" };

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
    localStorage.clear();
    getTopics.mockClear();
    updateTopic.mockClear();
    checkTopicPublish.mockClear();
    deleteTopic.mockClear();
    createTopic.mockClear();
    toastError.mockClear();
    toastSuccess.mockClear();
    copyTopic.mockClear();
    getTopicDetail.mockReset().mockImplementation(async () => emptyDetail());
    updateFieldMapping.mockReset().mockResolvedValue({ success: true, data: { success: true } });
    getVariableDictionary.mockReset().mockResolvedValue({ success: false });
    updateVariableDictionary.mockReset().mockResolvedValue({ success: false });
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    localStorage.clear();
    restoreDom?.();
    restoreDom = null;
});

function renderPage() {
    return render(
        <TeacherIdContext.Provider value={9}>
            <MemoryRouter initialEntries={["/topic"]}>
                <TopicManagement />
            </MemoryRouter>
        </TeacherIdContext.Provider>,
    );
}

test("draft, assigned and published topics expose the right actions", async () => {
    getTopics.mockResolvedValueOnce({ success: true, data: [draft, assigned, published] });
    const view = renderPage();

    await waitFor(() => expect(view.getByTestId("teacher-topic-row-1")).toBeTruthy());
    expect(view.getByTestId("teacher-topic-publish-1")).toBeTruthy();
    expect(view.getByTestId("teacher-topic-delete-1")).toBeTruthy();
    expect(view.getByTestId("teacher-topic-row-2").textContent).toContain("实验任务已分配 · 内容只读");
    expect(view.queryByTestId("teacher-topic-publish-2")).toBeNull();
    expect(view.queryByTestId("teacher-topic-delete-2")).toBeNull();
    expect(view.getByTestId("teacher-topic-row-3").textContent).toContain("已发布");
    expect(view.getByTestId("teacher-topic-copy-3")).toBeTruthy();
});

test("publishing a draft asks for confirmation then updates and reloads", async () => {
    getTopics.mockResolvedValue({ success: true, data: [draft] });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-topic-publish-1")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-topic-publish-1"));
    expect(view.getByText("确认发布该实验模板吗？发布后可分配给班级。")).toBeTruthy();

    const callsBefore = getTopics.mock.calls.length;
    fireEvent.click(await view.findByRole("button", { name: "确认" }));

    await waitFor(() => expect(updateTopic).toHaveBeenCalledWith(1, { status: 1 }));
    await waitFor(() => expect(getTopics.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(checkTopicPublish).toHaveBeenCalledWith(1);
    expect(view.getByRole("link", { name: "分配到班级" }).getAttribute("href")).toBe("/task?topicId=1");
});

test("failed preflight stays visible and can be retried without publishing", async () => {
    getTopics.mockResolvedValue({ success: true, data: [draft] });
    checkTopicPublish.mockResolvedValueOnce({ success: false, error: { code: "VALIDATION_ERROR", message: "当前总体没有合格的 PPS 规模变量" } });
    const view = renderPage();
    fireEvent.click(await view.findByTestId("teacher-topic-publish-1"));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("PPS"));
    expect(updateTopic).not.toHaveBeenCalled();
    expect(view.queryByRole("button", { name: "确认" })).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "重新检查" }));
    await view.findByRole("button", { name: "确认" });
    expect(view.queryByRole("alert")).toBeNull();
    expect(updateTopic).not.toHaveBeenCalled();
});

test("publication rejection after a successful check stays open and requires rechecking", async () => {
    getTopics.mockResolvedValue({ success: true, data: [draft] });
    updateTopic.mockResolvedValueOnce({ success: false });
    const view = renderPage();
    fireEvent.click(await view.findByTestId("teacher-topic-publish-1"));
    fireEvent.click(await view.findByRole("button", { name: "确认" }));
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("发布失败"));
    expect(view.getByRole("button", { name: "重新检查" })).toBeTruthy();
    expect(view.queryByRole("link", { name: "分配到班级" })).toBeNull();
    expect(updateTopic).toHaveBeenCalledTimes(1);
});

test("a template without population data cannot be published", async () => {
    getTopics.mockResolvedValueOnce({ success: true, data: [{ ...draft, dataRows: 0 }] });
    checkTopicPublish.mockResolvedValueOnce({ success: false, error: { code: "VALIDATION_ERROR", message: "实验模板需先上传总体数据后才能发布" } });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-topic-publish-1")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-topic-publish-1"));

    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("先上传总体数据"));
    expect(view.getByRole("button", { name: "修改模板" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "确认" })).toBeNull();
    expect(updateTopic).not.toHaveBeenCalled();
});

test("deleting a draft asks for irreversible confirmation then deletes", async () => {
    getTopics.mockResolvedValue({ success: true, data: [draft] });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-topic-delete-1")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-topic-delete-1"));
    expect(view.getByText(/将永久删除该实验模板/)).toBeTruthy();

    fireEvent.click(view.getByRole("button", { name: "永久删除" }));
    await waitFor(() => expect(deleteTopic).toHaveBeenCalledWith(1));
});

test("creating a topic opens the wizard and refuses an empty name", async () => {
    getTopics.mockResolvedValueOnce({ success: true, data: [] });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-topic-create-open")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-topic-create-open"));
    expect(view.getByRole("heading", { name: "创建实验模板" })).toBeTruthy();

    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("请输入实验模板名称"));
    expect(view.getByTestId("teacher-topic-save-error").textContent).toBe("请输入实验模板名称");
    expect(document.activeElement).toBe(view.getByTestId("teacher-topic-save-error"));
    expect(createTopic).not.toHaveBeenCalled();
});

test("a new topic draft survives closing and is cleared after creation", async () => {
    getTopics.mockResolvedValue({ success: true, data: [] });
    window.confirm = mock(() => true);
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-topic-create-open")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-topic-create-open"));
    fireEvent.change(view.getByLabelText("实验模板名称"), { target: { value: "本机模板草稿" } });
    expect(localStorage.getItem("wj:teacher-draft:9:topic:new")).toContain("本机模板草稿");
    fireEvent.click(view.getByRole("button", { name: "关闭" }));
    fireEvent.click(view.getByTestId("teacher-topic-create-open"));
    expect((view.getByLabelText("实验模板名称") as HTMLInputElement).value).toBe("本机模板草稿");

    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect(view.getByText("上传总体数据（Excel）")).toBeTruthy());
    expect(localStorage.getItem("wj:teacher-draft:9:topic:new")).toBeNull();
});

test("a successful retry clears the old network error instead of carrying recovery state forward", async () => {
    getTopics.mockResolvedValue({ success: true, data: [] });
    createTopic.mockResolvedValueOnce({ success: false, error: { code: "NETWORK_ERROR", message: "网络连接失败" } });
    createTopic.mockResolvedValueOnce({ success: true, data: { id: 44 } });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-topic-create-open")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-topic-create-open"));
    fireEvent.change(view.getByLabelText("实验模板名称"), { target: { value: "重试模板" } });
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect(view.getByTestId("teacher-topic-save-error").textContent).toContain("网络连接失败"));
    fireEvent.click(view.getByTestId("teacher-topic-next"));

    await waitFor(() => expect(view.getByText("上传总体数据（Excel）")).toBeTruthy());
    expect(view.queryByTestId("teacher-topic-save-error")).toBeNull();
});

for (const source of [assigned, published]) {
    test(`copying template ${source.id} reveals the draft and focuses its edit action`, async () => {
        getTopics.mockResolvedValueOnce({ success: true, data: [source] });
        getTopics.mockResolvedValueOnce({ success: true, data: [source, { ...draft, id: 44, name: "新副本" }] });
        const view = renderPage();
        await waitFor(() => expect(view.getByTestId(`teacher-topic-copy-${source.id}`)).toBeTruthy());
        fireEvent.change(view.getByTestId("teacher-topic-search"), { target: { value: source.name } });
        fireEvent.keyDown(view.getByTestId("teacher-topic-status-filter"), { key: "Enter" });
        fireEvent.click(view.getByRole("option", { name: "已发布" }));
        await waitFor(() => expect(document.activeElement === view.getByTestId("teacher-topic-status-filter")).toBe(true));
        fireEvent.click(view.getByTestId(`teacher-topic-copy-${source.id}`));
        await waitFor(() => expect(view.getByTestId("teacher-topic-edit-44")).toBeTruthy());
        expect(copyTopic).toHaveBeenCalledWith(source.id);
        expect((view.getByTestId("teacher-topic-search") as HTMLInputElement).value).toBe("");
        expect(view.getByTestId("teacher-topic-status-filter").textContent).toBe("草稿");
        expect(document.activeElement).toBe(view.getByTestId("teacher-topic-edit-44"));
        expect(toastSuccess).toHaveBeenCalledWith("已复制为草稿，可继续编辑后发布");
    });
}

test("failed copying leaves the current filter and search intact", async () => {
    getTopics.mockResolvedValueOnce({ success: true, data: [published] });
    copyTopic.mockResolvedValueOnce({ success: false, error: { code: "FAILED", message: "暂不可用" } });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-topic-copy-3")).toBeTruthy());
    fireEvent.change(view.getByTestId("teacher-topic-search"), { target: { value: published.name } });
    fireEvent.click(view.getByTestId("teacher-topic-copy-3"));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("复制失败: 暂不可用"));
    expect((view.getByTestId("teacher-topic-search") as HTMLInputElement).value).toBe(published.name);
    expect(toastSuccess).not.toHaveBeenCalled();
});

// Keep real page/wizard/dictionary state transitions. The API fixture models the
// server contract: changing field interpretation invalidates the old dictionary.
function mappingDictionaryFixture() {
    // PostgreSQL JSONB returns object keys in a normalized order. In particular,
    // the saved target need not retain the editor's { kind, field } insertion order.
    const persistedJson = (value: unknown) => JSON.stringify(value, (_key, item: unknown) =>
        item && typeof item === "object" && !Array.isArray(item)
            ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
            : item);
    const initialMapping: FieldMappingState = {
        identifier: "id", stratified: [], numeric: ["score"], others: [],
        analysisTarget: { kind: "mean", field: "score" },
    };
    const variables: VariableDictionary["variables"] = [
        { field: "id", label: "编号", unit: "", kind: "identifier", categories: [], missing: [] },
        { field: "score", label: "原始分数", unit: "分", kind: "continuous", categories: [], missing: [] },
        { field: "group", label: "组别", unit: "", kind: "nominal", categories: [{ value: "A", label: "A" }, { value: "B", label: "B" }], missing: [] },
    ];
    const state = {
        mapping: structuredClone(initialMapping),
        source: "original-source",
        revision: 1,
        dictionary: { source: "original-source", revision: 1, variables: structuredClone(variables) } as VariableDictionary | null,
    };
    getTopics.mockResolvedValue({ success: true, data: [draft] });
    getTopicDetail.mockImplementation(async () => ({ success: true, data: {
        topic: { ...draft, fieldMapping: structuredClone(state.mapping), excelRowCount: 4 },
        hasExcelFile: true, attachments: [], recommendQuestions: [],
        excelInfo: {
            columns: ["id", "score", "group"],
            preview: [{ id: "001", score: 1, group: "A" }, { id: "002", score: 2, group: "B" }],
            columnValues: { id: ["001", "002", "003", "004"], score: ["1", "2", "3", "4"], group: ["A", "B"] },
        },
    } }));
    updateFieldMapping.mockImplementation(async (_id, mapping) => {
        if (persistedJson(mapping) !== persistedJson(state.mapping)) {
            state.source = `saved-mapping-${state.revision + 1}`;
            state.revision += 1;
            state.dictionary = null;
        }
        state.mapping = JSON.parse(persistedJson(mapping)) as FieldMappingState;
        return { success: true, data: { success: true } };
    });
    getVariableDictionary.mockImplementation(async () => ({ success: true, data: {
        source: state.source, revision: state.revision, locked: false,
        dictionary: state.dictionary ? structuredClone(state.dictionary) : null,
        suggestion: { source: state.source, revision: state.revision, variables: structuredClone(variables) },
    } }));
    updateVariableDictionary.mockImplementation(async (_id, body) => {
        if (body.source !== state.source || body.observedRevision !== state.revision) {
            return { success: false, error: { code: "VARIABLE_SOURCE_CONFLICT", message: "总体数据或字段解释已变化，请重新载入" } };
        }
        state.revision += 1;
        state.dictionary = { ...structuredClone(body.dictionary), revision: state.revision };
        return { success: true, data: { success: true, revision: state.revision } };
    });
    return state;
}

async function openMappingEditor() {
    const view = renderPage();
    fireEvent.click(await view.findByTestId("teacher-topic-edit-1"));
    await waitFor(() => expect((view.getByTestId("teacher-topic-jump-3") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(view.getByTestId("teacher-topic-jump-3"));
    await view.findByLabelText("score 标签");
    await waitFor(() => expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false));
    return view;
}

test("a failed mapping save preserves its input and keeps dictionary saving blocked", async () => {
    const state = mappingDictionaryFixture();
    const view = await openMappingEditor();
    fireEvent.click(view.getByTestId("teacher-topic-mapping-others-group"));
    expect((view.getByLabelText("score 标签") as HTMLInputElement).disabled).toBe(true);
    expect((view.getByRole("button", { name: "明确确认并保存" }) as HTMLButtonElement).disabled).toBe(true);
    updateFieldMapping.mockResolvedValueOnce({ success: false, error: { code: "VALIDATION_ERROR", message: "字段保存失败，请重试" } });
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect(view.getByTestId("teacher-topic-save-error").textContent).toContain("字段保存失败"));
    expect(view.getByTestId("teacher-topic-step-3").getAttribute("aria-current")).toBe("step");
    expect((view.getByTestId("teacher-topic-mapping-others-group") as HTMLInputElement).checked).toBe(true);
    expect((view.getByLabelText("score 标签") as HTMLInputElement).disabled).toBe(true);
    expect((view.getByRole("button", { name: "明确确认并保存" }) as HTMLButtonElement).disabled).toBe(true);
    expect(getTopicDetail).toHaveBeenCalledTimes(1);
    expect(updateVariableDictionary).not.toHaveBeenCalled();
    expect(state.dictionary?.variables.find(variable => variable.field === "score")?.label).toBe("原始分数");
});

test("a failed detail reload after mapping save cannot advance or expose the old dictionary", async () => {
    const state = mappingDictionaryFixture();
    const view = await openMappingEditor();
    fireEvent.click(view.getByTestId("teacher-topic-mapping-others-group"));
    getTopicDetail.mockResolvedValueOnce({ success: false, error: { code: "NETWORK_ERROR", message: "详情暂时无法读取" } });
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await view.findByText("详情暂时无法读取");
    expect(updateFieldMapping).toHaveBeenCalledTimes(1);
    expect(state.mapping.others).toEqual(["group"]);
    expect(state.dictionary).toBeNull();
    expect(view.getByTestId("teacher-topic-step-3").getAttribute("aria-current")).toBe("step");
    expect(view.queryByLabelText("score 标签")).toBeNull();
    expect(view.queryByRole("button", { name: "明确确认并保存" })).toBeNull();
    expect(updateVariableDictionary).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: "重试加载" }));
    await waitFor(() => expect((view.getByLabelText("score 标签") as HTMLInputElement).disabled).toBe(false));
    expect(view.getByTestId("teacher-topic-step-3").getAttribute("aria-current")).toBe("step");
    expect((view.getByTestId("teacher-topic-mapping-others-group") as HTMLInputElement).checked).toBe(true);
});

test("saving mapping stays on the step so the confirmed new-source dictionary survives continuing", async () => {
    const state = mappingDictionaryFixture();
    const view = await openMappingEditor();
    fireEvent.click(view.getByTestId("teacher-topic-mapping-others-group"));
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect((view.getByLabelText("score 标签") as HTMLInputElement).disabled).toBe(false));
    await waitFor(() => expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false));
    expect(updateFieldMapping).toHaveBeenCalledTimes(1);
    expect(view.getByTestId("teacher-topic-step-3").getAttribute("aria-current")).toBe("step");
    expect(state.dictionary).toBeNull();

    const label = view.getByLabelText("score 标签");
    fireEvent.change(label, { target: { value: "已核对的新字典" } });
    fireEvent.click(view.getByRole("button", { name: "明确确认并保存" }));
    await waitFor(() => expect(state.dictionary?.variables.find(variable => variable.field === "score")?.label).toBe("已核对的新字典"));
    await waitFor(() => expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false));
    const confirmed = structuredClone(state.dictionary);
    const revision = state.revision;
    expect(updateVariableDictionary.mock.calls[0]?.[1].source).toBe(state.source);
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect(view.getByTestId("teacher-topic-step-4").getAttribute("aria-current")).toBe("step"));
    expect(state.dictionary).toEqual(confirmed);
    expect(state.revision).toBe(revision);

    fireEvent.click(view.getByTestId("teacher-topic-prev"));
    await waitFor(() => expect((view.getByLabelText("score 标签") as HTMLInputElement).value).toBe("已核对的新字典"));
    await waitFor(() => expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await waitFor(() => expect(view.getByTestId("teacher-topic-step-4").getAttribute("aria-current")).toBe("step"));
    expect(state.dictionary).toEqual(confirmed);
    expect(state.revision).toBe(revision);
});

test("an in-place mapping save establishes a clean navigation baseline", async () => {
    mappingDictionaryFixture();
    const view = await openMappingEditor();
    fireEvent.click(view.getByTestId("teacher-topic-mapping-others-group"));
    fireEvent.click(view.getByTestId("teacher-topic-save-mapping"));
    await waitFor(() => expect((view.getByLabelText("score 标签") as HTMLInputElement).disabled).toBe(false));
    await waitFor(() => expect((view.getByTestId("teacher-topic-next") as HTMLButtonElement).disabled).toBe(false));
    const confirm = mock(() => false);
    window.confirm = confirm;
    fireEvent.click(view.getByTestId("teacher-topic-prev"));
    expect(confirm).not.toHaveBeenCalled();
    expect(view.getByTestId("teacher-topic-step-2").getAttribute("aria-current")).toBe("step");
    fireEvent.click(view.getByTestId("teacher-topic-next"));
    await view.findByLabelText("score 标签");
    expect((view.getByTestId("teacher-topic-mapping-others-group") as HTMLInputElement).checked).toBe(true);
    expect(view.queryByTestId("teacher-topic-save-mapping")).toBeNull();
});
