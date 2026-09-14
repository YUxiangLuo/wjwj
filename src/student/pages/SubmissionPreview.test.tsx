import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";

// 组件必须在 DOM 全局安装后动态导入：Radix Portal 绑定当前 document。
let SubmissionPreview: typeof import("./SubmissionPreview").SubmissionPreview;

const originalFetch = globalThis.fetch;
let restoreDom: (() => void) | null = null;

beforeEach(async () => {
    restoreDom = installDomGlobals("http://localhost/student/task/12/preview").restore;
    ({ SubmissionPreview } = await import("./SubmissionPreview"));
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

const submittableExperiment = {
    id: 4,
    taskId: 12,
    version: 6,
    currentStage: 4,
    status: "in_progress",
    populationSize: 200,
    questionnaire: {
        title: "抽样调查问卷",
        welcomeText: "欢迎参加本次抽样调查实验，请根据实际情况认真填写问卷内容，谢谢配合。",
        endingText: "问卷到此结束，感谢你的参与和配合，祝你学习顺利。",
        questions: [
            { id: "q1", type: "single", content: "你是否了解抽样调查？", options: ["了解", "不了解"] },
            { id: "q2", type: "multiple", content: "你常用哪些数据分析工具？", options: ["Excel", "SPSS", "R"], minSelect: 1, maxSelect: 2 },
            { id: "q3", type: "scale", content: "你对统计课程的兴趣程度如何？", scaleMin: 1, scaleMax: 5 },
            { id: "q4", type: "boolean", content: "你是否做过问卷调查？" },
            { id: "q5", type: "single", content: "你认为样本量规划是否重要？", options: ["重要", "一般"] },
        ],
    },
    samplePlan: {
        confidenceLevel: "95",
        marginOfError: 5,
        designEffect: 1,
        nonResponseRate: 0,
        recommendedSize: 132,
        finalSampleSize: 50,
    },
    samplingResults: {
        simple: { completed: true, sampleCount: 50, seed: 1, data: [{ id: 1 }] },
        systematic: { completed: true, interval: 4, sampleCount: 50, seed: 2, data: [{ id: 2 }] },
    },
    reportContent: "这是实验报告正文，用于验证预览提交失败时的可访问反馈。".repeat(10),
    samplingPolicy: {
        version: 1,
        methods: { simple: "required", systematic: "optional", pps: "optional", stratified: "optional" },
    },
};

test("submission previews distinguish selected, unselected, and disabled sampling methods", async () => {
    const experiment = {
        id: 4,
        taskId: 12,
        version: 6,
        currentStage: 4,
        status: "in_progress",
        populationSize: 200,
        questionnaire: null,
        samplePlan: null,
        samplingResults: {
            simple: { completed: true, sampleCount: 50 },
            systematic: { completed: true, sampleCount: 50, interval: 4 },
        },
        reportContent: "",
        samplingPolicy: {
            version: 1,
            methods: { simple: "required", systematic: "optional", pps: "optional", stratified: "disabled" },
        },
    };
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/student/tasks/12/experiment")) {
            return Response.json({ success: true, data: experiment });
        }
        if (url.endsWith("/api/student/tasks/12")) {
            return Response.json({
                success: true,
                data: {
                    id: 12,
                    topicId: 3,
                    name: "策略实验",
                    description: "",
                    publishedAt: "2026-01-01T00:00:00.000Z",
                    deadline: null,
                    status: "in_progress",
                    currentStage: 4,
                    populationSize: 200,
                    attachments: [],
                    recommendQuestions: [],
                    samplingPolicy: experiment.samplingPolicy,
                },
            });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/task/12/preview"]}>
            <Routes><Route path="/task/:taskId/preview" element={<SubmissionPreview />} /></Routes>
        </MemoryRouter>,
    );

    await waitFor(() => expect(view.getByTestId("student-preview-sampling-pps").textContent).toContain("未选择"));
    expect(view.getByTestId("student-preview-sampling-simple").textContent).toContain("已完成");
    // Disabled methods are not rendered as selectable rows.
    expect(view.queryByTestId("student-preview-sampling-stratified")).toBeNull();
});

test("a failed submission is announced to assistive technology", async () => {
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/api/student/tasks/12/experiment")) {
            return Response.json({ success: true, data: submittableExperiment });
        }
        if (url.endsWith("/api/student/tasks/12")) {
            return Response.json({
                success: true,
                data: {
                    id: 12, topicId: 3, name: "策略实验", description: "",
                    publishedAt: "2026-01-01T00:00:00.000Z", deadline: null,
                    status: "in_progress", currentStage: 4, populationSize: 200,
                    attachments: [], recommendQuestions: [],
                    samplingPolicy: submittableExperiment.samplingPolicy,
                },
            });
        }
        if (url.endsWith("/api/student/tasks/12/submit") && init?.method === "POST") {
            return Response.json({
                success: false,
                error: { code: "INCOMPLETE", message: "总体方差与当前总体不一致，请按当前总体重新计算样本量" },
            }, { status: 400 });
        }
        throw new Error(`Unhandled fetch: ${url}`);
    }) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/task/12/preview"]}>
            <Routes><Route path="/task/:taskId/preview" element={<SubmissionPreview />} /></Routes>
        </MemoryRouter>,
    );

    await waitFor(() => expect(view.getByTestId("student-preview-submit")).toBeTruthy());
    fireEvent.click(view.getByTestId("student-preview-submit"));
    // 确认对话框经 Portal 渲染到 document.body
    await waitFor(() => expect(document.querySelector('[data-testid="student-preview-submit-confirm"]')).toBeTruthy());
    fireEvent.click(document.querySelector('[data-testid="student-preview-submit-confirm"]') as HTMLElement);

    await waitFor(() => {
        const alert = view.getByTestId("student-preview-submit-error");
        expect(alert.getAttribute("role")).toBe("alert");
        expect(alert.textContent).toContain("总体方差与当前总体不一致");
    });
});
