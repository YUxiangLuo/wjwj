import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import type { TaskDetail } from "../api-client";
import { TopicDetails } from "./TopicDetails";

const originalFetch = globalThis.fetch;
let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/12").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

test("task details keep sampling requirements visible when a questionnaire template is attached", async () => {
    const task: TaskDetail = {
        id: 12,
        topicId: 7,
        name: "演示抽样任务",
        description: "<p>任务说明</p>",
        publishedAt: "2026-01-01T00:00:00.000Z",
        deadline: null,
        status: "not_started",
        currentStage: 0,
        populationSize: 100,
        attachments: [{
            id: 91,
            name: "调查问卷设计规范与模板.docx",
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: 1024,
        }],
        recommendQuestions: [],
        samplingPolicy: {
            version: 1,
            methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" },
        },
    };
    globalThis.fetch = mock(async () => Response.json({ success: true, data: task })) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/task/12"]}>
            <Routes>
                <Route path="/task/:taskId" element={<TopicDetails />} />
            </Routes>
        </MemoryRouter>,
    );

    await waitFor(() => expect(view.getByTestId("student-task-sampling-policy")).toBeTruthy());
    expect(view.getByText("抽样方法要求")).toBeTruthy();
    expect(view.getByText("PPS抽样")).toBeTruthy();
    expect(view.getByText("不适用")).toBeTruthy();
    expect(view.queryByTestId("student-task-built-in-questionnaire-resource")).toBeNull();
    expect(view.getAllByText("调查问卷设计规范与模板.docx")).toHaveLength(1);
});

test.each([
    { status: "in_progress", deadline: null, label: "继续实验" },
    { status: "rejected", deadline: null, label: "继续修改" },
    { status: "not_started", deadline: "2020-02-01T00:00:00.000Z", label: "开始实验" },
] as const)("compact task summary preserves the action and deadline gate for $status", async ({ status, deadline, label }) => {
    const task: TaskDetail = {
        id: 12, topicId: 7, name: "任务状态测试", description: "",
        publishedAt: "2020-01-01T00:00:00.000Z", deadline, status,
        currentStage: status === "not_started" ? 0 : 4,
        populationSize: 100, attachments: [], recommendQuestions: [],
    };
    globalThis.fetch = mock(async () => Response.json({ success: true, data: task })) as unknown as typeof fetch;
    const view = render(
        <MemoryRouter initialEntries={["/task/12"]}>
            <Routes><Route path="/task/:taskId" element={<TopicDetails />} /></Routes>
        </MemoryRouter>,
    );

    await waitFor(() => expect(view.getByTestId("student-task-action")).toBeTruthy());
    if (deadline) {
        expect((view.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(true);
        expect(view.getByText("任务已截止，无法继续操作")).toBeTruthy();
    } else {
        expect(view.getByRole("link", { name: label }).getAttribute("href")).toBe("/task/12/experiment");
        expect(view.queryByText("开始实验")).toBeNull();
    }
});

test.each(["submitted", "graded"] as const)("compact $status summary preserves result access and completed stages", async (status) => {
    const task: TaskDetail = {
        id: 12, topicId: 7, name: "已完成任务", description: "<p>完整说明仍可阅读</p>",
        publishedAt: "2020-01-01T00:00:00.000Z", deadline: "2020-02-01T00:00:00.000Z", status,
        currentStage: 4, populationSize: 100, attachments: [], recommendQuestions: [], score: 87,
    };
    globalThis.fetch = mock(async () => Response.json({ success: true, data: task })) as unknown as typeof fetch;
    const view = render(<MemoryRouter initialEntries={["/task/12"]}><Routes>
        <Route path="/task/:taskId" element={<TopicDetails />} />
    </Routes></MemoryRouter>);
    const action = await view.findByTestId("student-task-action");
    expect(action.querySelector("a")?.getAttribute("href")).toBe("/task/12/result");
    expect(view.getByRole("list", { name: "实验进度概览" }).querySelectorAll("li")).toHaveLength(4);
    expect(view.queryByText("任务已截止，无法继续操作")).toBeNull();
    expect(view.getByText("完整说明仍可阅读")).toBeTruthy();
    if (status === "graded") expect(view.getByText("实验成绩：87")).toBeTruthy();
});
