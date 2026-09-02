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
