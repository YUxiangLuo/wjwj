import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { SubmissionPreview } from "./SubmissionPreview";
import { ImmersiveReportPreviewContent } from "../components/ImmersiveReportPreview";

const originalFetch = globalThis.fetch;
let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/12/preview").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
    restoreDom?.();
    restoreDom = null;
});

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
    expect(view.getByRole("heading", { level: 1, name: "提交前预览" })).toBeTruthy();
    expect(view.getByTestId("student-preview-sampling-simple").textContent).toContain("已完成");
    expect(view.queryByTestId("student-preview-sampling-stratified")).toBeNull();

    const fullPreview = render(
        <ImmersiveReportPreviewContent experiment={experiment as any} taskName="策略实验" onClose={() => undefined} />,
    );
    const ppsRow = fullPreview.getByText("PPS抽样").parentElement;
    expect(ppsRow?.textContent).toContain("未选择");
    expect(within(fullPreview.container).queryByText("分层抽样")).toBeNull();
});
