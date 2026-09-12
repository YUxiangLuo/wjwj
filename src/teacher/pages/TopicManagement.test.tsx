import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { Topic } from "../api-client";
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
const deleteTopic = mock(async (_id: number) => ({ success: true }));
const createTopic = mock(async (_body: unknown) => ({ success: true, data: { id: 44 } }));
const realClient = await import("../api-client");
mock.module("../api-client", () => ({
    ...realClient,
    teacherApi: {
        ...realClient.teacherApi,
        getTopics,
        updateTopic,
        deleteTopic,
        createTopic,
        getTopicDetail: async () => ({ success: true, data: { topic: null, hasExcelFile: false, attachments: [], recommendQuestions: [] } }),
        uploadTopicExcel: async () => ({ success: true, data: { rowCount: 0, columns: [], preview: [] } }),
        copyTopic,
    },
}));
mock.module("@/components/RichTextEditor", () => ({
    RichTextEditor: ({ value }: { value: string }) => <div data-testid="mock-richtext">{value}</div>,
}));
mock.module("@/components/questionnaire/QuestionEditor", () => ({ QuestionEditor: () => null }));

const { TopicManagement } = await import("./TopicManagement");
bootstrapDom.restore();

const draft: Topic = { id: 1, name: "咖啡馆调查", description: null, status: 0, dataRows: 80, hasTasks: false, createdAt: "2026-09-01T00:00:00.000Z" };
const assigned: Topic = { id: 2, name: "阅读时长调查", description: "已分配", status: 1, dataRows: 24, hasTasks: true, createdAt: "2026-09-02T00:00:00.000Z" };
const published: Topic = { id: 3, name: "毕业生就业比例", description: null, status: 1, dataRows: 160, hasTasks: false, createdAt: "2026-09-03T00:00:00.000Z" };

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
    getTopics.mockClear();
    updateTopic.mockClear();
    deleteTopic.mockClear();
    createTopic.mockClear();
    toastError.mockClear();
    toastSuccess.mockClear();
    copyTopic.mockClear();
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/topic"]}>
            <TopicManagement />
        </MemoryRouter>,
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
    fireEvent.click(view.getByRole("button", { name: "确认" }));

    await waitFor(() => expect(updateTopic).toHaveBeenCalledWith(1, { status: 1 }));
    await waitFor(() => expect(getTopics.mock.calls.length).toBeGreaterThan(callsBefore));
});

test("a template without population data cannot be published", async () => {
    getTopics.mockResolvedValueOnce({ success: true, data: [{ ...draft, dataRows: 0 }] });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-topic-publish-1")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-topic-publish-1"));

    expect(toastError).toHaveBeenCalledWith("实验模板需先上传总体数据后才能发布");
    expect(view.queryByText("确认发布该实验模板吗？发布后可分配给班级。")).toBeNull();
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
    expect(createTopic).not.toHaveBeenCalled();
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
