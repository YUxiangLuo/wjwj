import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { GradingDetail } from "./GradingDetail";

let restoreDom: (() => void) | null = null;
const originalFetch = globalThis.fetch;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/teacher/grading/foo").restore;
});

afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = originalFetch;
});

afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    restoreDom?.();
    restoreDom = null;
});

test("invalid grading IDs render a terminal not-found state without requesting data", async () => {
    const fetchMock = mock(async () => {
        throw new Error("invalid ID must not trigger a request");
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/grading/foo"]}>
            <Routes>
                <Route path="/grading/:submissionId" element={<GradingDetail />} />
            </Routes>
        </MemoryRouter>,
    );

    await waitFor(() => {
        expect(view.getByText("未找到提交记录")).toBeTruthy();
    });
    expect(fetchMock).not.toHaveBeenCalled();
});

test("grading inputs are programmatically associated with their labels", async () => {
    globalThis.fetch = mock(async () => Response.json({
        success: true,
        data: {
            id: 7,
            version: 2,
            studentName: "张三",
            studentId: "S001",
            topic: "抽样调查",
            className: "统计一班",
            submittedAt: "2026-07-23T00:00:00.000Z",
            status: "submitted",
            score: null,
            gradedByName: null,
            gradedAt: null,
            topicDesc: "",
            reportContent: "<p>报告正文</p>",
            samplePlan: null,
            questionnaire: null,
            samplingResults: null,
            populationSize: 240,
            scoreQuestionnaire: null,
            scoreProcess: null,
            scoreReport: null,
            totalScore: null,
            teacherComment: null,
            rejectReason: null,
            weights: { questionnaire: 30, process: 30, report: 40 },
        },
    })) as unknown as typeof fetch;

    const view = render(
        <MemoryRouter initialEntries={["/grading/7"]}>
            <Routes>
                <Route path="/grading/:submissionId" element={<GradingDetail />} />
            </Routes>
        </MemoryRouter>,
    );

    await waitFor(() => expect(view.getByLabelText("问卷设计（30%）")).toBeTruthy());
    expect(view.getByLabelText("实验过程（30%）")).toBeTruthy();
    expect(view.getByLabelText("实验报告（40%）")).toBeTruthy();
    expect(view.getByLabelText("教师评语")).toBeTruthy();
});
