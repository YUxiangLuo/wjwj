import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { TargetAnalysisMetrics, TargetMethodMetrics } from "@/domain/experiment/analysis-types";
import { installDomGlobals } from "@/test-utils/dom";
import { SubmissionDetailPage } from "./SubmissionDetail";

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

const unavailableTargetMethod: TargetMethodMetrics = {
    estimate: null,
    standardError: null,
    marginOfError: null,
    sampleSize: null,
    effectiveSampleSize: null,
    reliability: { status: "unavailable", reasons: [] },
};

const frozenTargetMetrics: TargetAnalysisMetrics = {
    contract: {
        inferred: false,
        contract: {
            version: 1 as const,
            researchQuestion: "总体平均重量是多少？",
            targetPopulation: "全部单位",
            unitOfAnalysis: "一行记录",
            target: { kind: "mean" as const, field: "weight" },
        },
    },
    confidenceLevel: "95" as const,
    plannedMarginOfError: 2,
    unit: "kg",
    populationValue: 10,
    methods: {
        simple: { estimate: 9.5, standardError: 0.5, marginOfError: 0.98, sampleSize: 60, effectiveSampleSize: 55, reliability: { status: "ok", reasons: [] } },
        systematic: unavailableTargetMethod,
        pps: unavailableTargetMethod,
        stratified: unavailableTargetMethod,
    },
};

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
                targetMetrics: frozenTargetMetrics,
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
    expect(view.getByText("研究目标结果")).toBeTruthy();
    expect(view.getByText("10.0000 kg")).toBeTruthy();
    expect(view.getByText("9.5000 kg")).toBeTruthy();
    expect(view.getByText("±0.9800 kg")).toBeTruthy();
});
