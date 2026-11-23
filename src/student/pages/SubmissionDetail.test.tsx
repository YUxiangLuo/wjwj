import { afterAll, afterEach, beforeAll, expect, mock, test } from "bun:test";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { TargetAnalysisMetrics, TargetMethodMetrics } from "@/domain/experiment/analysis-types";
import { installDomGlobals } from "@/test-utils/dom";

const bootstrapDom = installDomGlobals("http://localhost/student/task/40/result");
const { cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { SubmissionDetailPage } = await import("./SubmissionDetail");
bootstrapDom.restore();

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
        expect(view.queryByTestId("student-submission-content") !== null).toBe(true);
        expect(view.queryByText("snapshot-review-marker") !== null).toBe(true);
    });
    expect(view.queryByText("提交时课题") !== null).toBe(true);
    expect(view.queryByText("研究目标结果") !== null).toBe(true);
    expect(view.queryByText("10.0000 kg") !== null).toBe(true);
    expect(view.queryByText("9.5000 kg") !== null).toBe(true);
    expect(view.queryByText("±0.9800 kg") !== null).toBe(true);
    expect(view.queryByTestId("student-submission-pending") !== null).toBe(true);
    expect(view.queryByTestId("student-submission-scores") === null).toBe(true);
    expect(Boolean(view.getByTestId("student-submission-pending").compareDocumentPosition(view.getByTestId("student-submission-content")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
});

test("graded result distinguishes component scores from their weights", async () => {
    globalThis.fetch = mock(async () => Response.json({
        success: true,
        data: {
            id: 501,
            taskId: 40,
            version: 13,
            topicId: 12,
            topicName: "抽样调查",
            submittedAt: "2026-03-08T08:00:00.000Z",
            status: "graded",
            scoreQuestionnaire: 88,
            scoreProcess: 91,
            scoreReport: 93,
            totalScore: 90.9,
            teacherComment: "完成良好",
            rejectReason: null,
            gradedAt: "2026-03-08T10:00:00.000Z",
            graderName: "王老师",
            weights: { questionnaire: 30, process: 30, report: 40 },
            snapshot: {
                topicName: "抽样调查",
                studentName: "学生",
                populationSize: 100,
                questionnaire: null,
                samplePlan: null,
                samplingResults: null,
                samplingPolicy: { version: 1, methods: {} },
                reportContent: "",
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

    await waitFor(() => expect(view.queryByText("90.9") !== null).toBe(true));
    expect(view.queryByText("88") !== null).toBe(true);
    expect(view.queryByText("91") !== null).toBe(true);
    expect(view.queryByText("93") !== null).toBe(true);
    expect(view.getAllByText("权重 30%")).toHaveLength(2);
    expect(view.queryByText("权重 40%") !== null).toBe(true);
    expect(view.queryByTestId("student-submission-scores") !== null).toBe(true);
    expect(Boolean(view.getByTestId("student-submission-feedback").compareDocumentPosition(view.getByTestId("student-submission-content")) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
});

test("proportion submission forwards contract target to WaveLoopSnapshot for percentage formatting", async () => {
    globalThis.fetch = mock(async () => Response.json({
        success: true,
        data: {
            id: 502,
            taskId: 40,
            version: 14,
            topicId: 12,
            topicName: "会员续费比例课题",
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
                topicName: "会员续费比例课题",
                studentName: "学生",
                populationSize: 200,
                questionnaire: { title: "续费问卷", welcomeText: "", endingText: "", questions: [] },
                samplePlan: { estimationType: "proportion", confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0.1, recommendedSize: 80, finalSampleSize: 80 },
                samplingResults: { simple: { completed: true, sampleCount: 80 } },
                reportContent: "<p>比例结果验证</p>",
                targetMetrics: {
                    ...frozenTargetMetrics,
                    unit: null,
                    populationValue: 0.62,
                    contract: {
                        inferred: false,
                        contract: {
                            version: 1 as const,
                            researchQuestion: "续费率是多少？",
                            targetPopulation: "全部会员",
                            unitOfAnalysis: "一名会员",
                            target: { kind: "proportion" as const, field: "renewed", positiveCategory: "1" },
                        },
                    },
                },
                waves: [
                    {
                        waveNumber: 1,
                        kind: "pilot",
                        label: "第 1 轮 · 首轮试投",
                        questionnaire: { title: "续费问卷", welcomeText: "", endingText: "", questions: [] },
                        samplePlan: { estimationType: "proportion", confidenceLevel: "95", marginOfError: 8, designEffect: 1, nonResponseRate: 0.1, recommendedSize: 40, finalSampleSize: 40 },
                        samplingResults: { simple: { completed: true, sampleCount: 40 } },
                        diagnostics: {
                            simple: {
                                method: "simple",
                                invitedCount: 40,
                                contactedCount: 36,
                                notContactedCount: 4,
                                refusedCount: 2,
                                breakoffCount: 2,
                                completedRawCount: 32,
                                speederCount: 2,
                                straightlinerCount: 0,
                                cleanedValidCount: 30,
                                effectiveRatePct: 75,
                                empiricalNonResponseRatePct: 25,
                                empiricalTargetVariance: 0.24,
                                empiricalTargetStdDev: 0.49,
                                totalEstimatedCost: 400,
                                unitEffectiveCost: 13.3,
                                stratumField: null,
                                maxStratumBiasPp: null,
                                strata: [],
                                burden: {
                                    questionCount: 1,
                                    estimatedSeconds: 25,
                                    estimatedMinutes: 0.4,
                                    openTextCount: 0,
                                    longOptionQuestionCount: 0,
                                    sensitiveEarlyCount: 0,
                                    missingTargetBinding: false,
                                    unitNonResponsePenalty: 0,
                                    breakoffPenalty: 0,
                                    totalBreakoffProbability: 0.05,
                                    warnings: [],
                                },
                                populationTruth: 0.62,
                                estimates: [
                                    { key: "cleaned_design", label: "质检清洗后估计", description: "有效卷", sampleSize: 30, estimate: 0.6, standardError: 0.08, halfWidth: 0.1568 },
                                ],
                                questionDiagnostics: [],
                                sampleAnomalies: [],
                            },
                        },
                        completedAt: "2026-03-08T07:00:00.000Z",
                    },
                ],
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

    const wavesTab = await waitFor(() => view.getByRole("tab", { name: "试投质检与调优闭环" }));
    fireEvent.mouseDown(wavesTab, { button: 0 });
    await waitFor(() => expect(view.queryByTestId("wave-loop-snapshot") !== null).toBe(true));
    expect(view.container.textContent).toContain("60.00%");
});
