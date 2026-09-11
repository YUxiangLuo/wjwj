import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { TaskProgressData } from "../api-client";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals();
const { cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { MemoryRouter, Route, Routes } = await import("react-router-dom");

const getTaskProgress = mock(async (_id: number) => ({ success: true, data: undefined as TaskProgressData | undefined }));
mock.module("../api-client", () => ({ teacherApi: { getTaskProgress } }));

const { TaskProgressDetail } = await import("./TaskProgressDetail");
bootstrapDom.restore();

const progress: TaskProgressData = {
    task: { topicName: "咖啡馆", className: "统计一班", deadline: null },
    counts: { not_started: 1, stage1: 0, stage2: 1, stage3: 0, stage4: 0, submitted: 1, graded: 1, rejected: 0 },
    students: [
        { studentId: "S001", name: "甲", status: "not_started", stage: null, lastActivity: null, submissionId: null },
        { studentId: "S002", name: "乙", status: "stage2", stage: 2, lastActivity: null, submissionId: null },
        { studentId: "S003", name: "丙", status: "submitted", stage: 4, lastActivity: null, submissionId: 12 },
        { studentId: "S004", name: "丁", status: "graded", stage: 4, lastActivity: null, submissionId: 13 },
    ],
};

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/teacher").restore;
    getTaskProgress.mockClear();
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

function renderAt(taskId: string) {
    return render(
        <MemoryRouter initialEntries={[`/task/${taskId}/progress`]}>
            <Routes>
                <Route path="/task/:taskId/progress" element={<TaskProgressDetail />} />
                <Route path="/task" element={<p>任务列表</p>} />
                <Route path="/grading/:id" element={<p>批改详情</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

test("an invalid task id renders a terminal message without requesting data", () => {
    const view = renderAt("abc");

    expect(view.getByText("无效的任务编号")).toBeTruthy();
    expect(getTaskProgress).not.toHaveBeenCalled();
});

test("renders the task header, status totals and per-student actions", async () => {
    getTaskProgress.mockResolvedValueOnce({ success: true, data: progress });
    const view = renderAt("7");

    await waitFor(() => expect(view.getByText("咖啡馆")).toBeTruthy());
    expect(view.getByText("统计一班")).toBeTruthy();
    expect(view.getByText("无截止时间")).toBeTruthy();
    expect(view.getByText("4 名学生")).toBeTruthy();

    const table = within(view.getByRole("table", { name: "任务学生进度" }));
    expect(table.getByText("S001")).toBeTruthy();
    expect(table.getByText("进入批改")).toBeTruthy();
    expect(table.getByText("查看详情")).toBeTruthy();
    expect(table.getByText("进行中，提交后可批改")).toBeTruthy();
});

test("search filters by student id or name and shows an explicit empty state", async () => {
    getTaskProgress.mockResolvedValueOnce({ success: true, data: progress });
    const view = renderAt("7");
    await waitFor(() => expect(view.getByText("S002")).toBeTruthy());

    const search = view.getByPlaceholderText("搜索学号/姓名");
    fireEvent.change(search, { target: { value: "乙" } });
    expect(view.queryByText("S001")).toBeNull();
    expect(view.getByText("S002")).toBeTruthy();

    fireEvent.change(search, { target: { value: "zzz" } });
    expect(view.getByText("暂无数据")).toBeTruthy();
});

test("a failed load surfaces the error and retry refetches", async () => {
    getTaskProgress
        .mockResolvedValueOnce({ success: false, error: { message: "任务进度加载失败" } } as never)
        .mockResolvedValueOnce({ success: true, data: progress });

    const view = renderAt("7");
    await waitFor(() => expect(view.getByRole("alert").textContent).toContain("任务进度加载失败"));

    fireEvent.click(view.getByRole("button", { name: "重试加载" }));

    await waitFor(() => expect(view.getByText("咖啡馆")).toBeTruthy());
    expect(getTaskProgress).toHaveBeenCalledTimes(2);
});

test("surfaces students whose required PPS was skipped because the data cannot support it", async () => {
    getTaskProgress.mockResolvedValueOnce({
        success: true,
        data: {
            ...progress,
            ppsUnavailable: { count: 2, students: [{ studentId: "S1", name: "甲" }, { studentId: "S2", name: "乙" }] },
        },
    });
    const view = renderAt("5");

    await waitFor(() => expect(view.getByTestId("teacher-progress-pps-unavailable")).toBeTruthy());
    expect(view.getByTestId("teacher-progress-pps-unavailable").textContent).toContain("2 名学生");
    expect(view.getByTestId("teacher-progress-pps-unavailable").textContent).toContain("甲");
});

test("keeps the page free of a PPS notice when nothing was skipped", async () => {
    getTaskProgress.mockResolvedValueOnce({ success: true, data: { ...progress, ppsUnavailable: { count: 0, students: [] } } });
    const view = renderAt("5");

    await waitFor(() => expect(view.getByText("咖啡馆")).toBeTruthy());
    expect(view.queryByTestId("teacher-progress-pps-unavailable")).toBeNull();
});
