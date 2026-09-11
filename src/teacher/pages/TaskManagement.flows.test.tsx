import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { Task } from "../api-client";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { MemoryRouter } = await import("react-router-dom");

const toastError = mock(() => undefined);
const toastSuccess = mock(() => undefined);
mock.module("sonner", () => ({ toast: { error: toastError, success: toastSuccess } }));

const getTasks = mock(async () => ({ success: true, data: [] as Task[] }));
const createTask = mock(async (_body: unknown) => ({ success: true }));
const deleteTask = mock(async (_id: number) => ({ success: true }));
const extendTaskDeadline = mock(async (_id: number, _deadline: string) => ({ success: true }));

const realClient = await import("../api-client");
mock.module("../api-client", () => ({
    ...realClient,
    teacherApi: {
        ...realClient.teacherApi,
        getTasks,
        createTask,
        deleteTask,
        extendTaskDeadline,
        getTopics: async () => ({ success: true, data: [] }),
        getClasses: async () => ({ success: true, data: [] }),
    },
}));

const { TaskManagement } = await import("./TaskManagement");
bootstrapDom.restore();

const day = 86_400_000;
const openTask: Task = { id: 1, topicId: 1, classId: 1, topic: "咖啡馆调查", className: "统计一班", publishedAt: new Date(Date.now() - day).toISOString(), deadline: new Date(Date.now() + day).toISOString(), total: 9, completed: 3, pending: 2 };
const upcomingTask: Task = { id: 2, topicId: 1, classId: 2, topic: "阅读时长", className: "统计二班", publishedAt: new Date(Date.now() + day).toISOString(), deadline: null, total: 6, completed: 0, pending: 0 };
const expiredTask: Task = { id: 3, topicId: 2, classId: 1, topic: "毕业生就业", className: "统计一班", publishedAt: new Date(Date.now() - 3 * day).toISOString(), deadline: new Date(Date.now() - day).toISOString(), total: 9, completed: 9, pending: 0 };

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
    getTasks.mockClear();
    createTask.mockClear();
    deleteTask.mockClear();
    extendTaskDeadline.mockClear();
    toastError.mockClear();
    toastSuccess.mockClear();
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/task"]}>
            <TaskManagement />
        </MemoryRouter>,
    );
}

test("a failed load shows the error and retry refetches", async () => {
    getTasks
        .mockResolvedValueOnce({ success: false, error: { message: "任务列表加载失败" } } as never)
        .mockResolvedValue({ success: true, data: [openTask] });

    const view = renderPage();
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("任务列表加载失败"));

    fireEvent.click(view.getByRole("button", { name: "重试加载" }));
    await waitFor(() => expect(view.getByTestId("teacher-task-row-1")).toBeTruthy());
});

test("summarises tasks and renders per-row status", async () => {
    getTasks.mockResolvedValue({ success: true, data: [openTask, upcomingTask, expiredTask] });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-task-row-1")).toBeTruthy());

    const openRow = within(view.getByTestId("teacher-task-row-1"));
    expect(openRow.getByText("3/9")).toBeTruthy();
    expect(openRow.getByRole("link", { name: /进度/ }).getAttribute("href")).toBe("/task/1/progress");
    expect(openRow.getByText("2")).toBeTruthy();
    expect(within(view.getByTestId("teacher-task-row-2")).getByText("尚未开放")).toBeTruthy();
    expect(within(view.getByTestId("teacher-task-row-3")).getByText("已截止")).toBeTruthy();
});

test("search filters tasks and shows an explicit empty state", async () => {
    getTasks.mockResolvedValue({ success: true, data: [openTask, upcomingTask, expiredTask] });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-task-row-1")).toBeTruthy());

    fireEvent.change(view.getByTestId("teacher-task-search"), { target: { value: "阅读" } });
    expect(view.queryByTestId("teacher-task-row-1")).toBeNull();
    expect(view.getByTestId("teacher-task-row-2")).toBeTruthy();

    fireEvent.change(view.getByTestId("teacher-task-search"), { target: { value: "不存在" } });
    expect(view.getByText("暂无符合条件的数据")).toBeTruthy();
});

test("deleting a task requires irreversible confirmation then reloads", async () => {
    getTasks.mockResolvedValue({ success: true, data: [openTask] });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-task-delete-open-1")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-task-delete-open-1"));
    expect(view.getByText(/此操作不可恢复；再次发布会创建全新的空任务。/)).toBeTruthy();

    fireEvent.click(view.getByTestId("teacher-task-delete-confirm"));
    await waitFor(() => expect(deleteTask).toHaveBeenCalledWith(1));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("任务已删除"));
});

test("publishing without a template or class is rejected before the API call", async () => {
    getTasks.mockResolvedValue({ success: true, data: [] });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-task-publish-open")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-task-publish-open"));
    await waitFor(() => expect(view.getByTestId("teacher-task-publish-submit")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-task-publish-submit"));
    expect(toastError).toHaveBeenCalledWith("请选择实验模板和班级");
    expect(createTask).not.toHaveBeenCalled();
});

test("opening the extend dialog targets the selected task", async () => {
    getTasks.mockResolvedValue({ success: true, data: [openTask] });
    const view = renderPage();
    await waitFor(() => expect(view.getByTestId("teacher-task-extend-open-1")).toBeTruthy());

    fireEvent.click(view.getByTestId("teacher-task-extend-open-1"));

    expect(view.getByRole("heading", { name: "延长截止时间" })).toBeTruthy();
    expect(view.getByTestId("teacher-task-extend-deadline")).toBeTruthy();
});
