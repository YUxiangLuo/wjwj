import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { SubmissionDetailPage } from "./SubmissionDetail";

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/student/task/40/result").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("student result renders the immutable submission snapshot", async () => {
    globalThis.fetch = mock(async () => Response.json({
        success: true,
        data: {
            id: 501,
            taskId: 40,
            version: 12,
            topicId: 12,
            topicName: "提交时课题",
            submittedAt: "2026-03-08T08:00:00.000Z",
            status: "submitted",
            scoreQuestionnaire: null,
            scoreProcess: null,
            scoreReport: null,
            totalScore: null,
            teacherComment: null,
            rejectReason: null,
            gradedAt: null,
            graderName: null,
            weights: { questionnaire: 30, process: 30, report: 40 },
            snapshot: {
                topicName: "提交时课题",
                studentName: "提交时姓名",
                populationSize: 900,
                questionnaire: { title: "提交时问卷", welcomeText: "", endingText: "", questions: [] },
                samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 60, finalSampleSize: 60 },
                samplingResults: { simple: { completed: true, sampleCount: 60 } },
                reportContent: "<h2>不可变报告</h2><p>snapshot-review-marker</p>",
            },
        },
    })) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/task/40/result"]}>
            <Routes>
                <Route path="/task/:taskId/result" element={<SubmissionDetailPage />} />
            </Routes>
        </MemoryRouter>,
    );

    await waitFor(() => {
        expect(view.getByTestId("student-submission-content")).toBeTruthy();
        expect(view.getByText("snapshot-review-marker")).toBeTruthy();
    });
    expect(view.getByText("提交时课题")).toBeTruthy();
});
