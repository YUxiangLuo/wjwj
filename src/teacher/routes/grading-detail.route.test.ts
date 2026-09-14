import { expect, mock, test } from "bun:test";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withId(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

test("grading detail prefers the immutable submission snapshot", async () => {
    const snapshot = {
        studentName: "提交时学生",
        topicName: "提交时课题",
        populationSize: 7200,
        questionnaire: { title: "提交时问卷", questions: [] },
        samplePlan: { confidenceLevel: "90", marginOfError: 4, recommendedSize: 210, finalSampleSize: 240 },
        samplingResults: { simple: { completed: true, sampleCount: 240, data: Array.from({ length: 240 }, () => ({})) } },
        samplingPolicy: { version: 1, methods: { simple: "required", systematic: "optional", pps: "disabled", stratified: "optional" } },
        reportContent: "提交时报告",
        weightConfig: { questionnaire: 40, process: 35, report: 25 },
        analysisAppendices: [{ id: 8, stale: false }],
    };
    const attemptTime = new Date("2026-03-08T09:00:00Z");
    const { db } = createMockDb({ select: [
        [{
            id: 99, version: 7, studentName: "当前学生", studentId: "S001", className: "统计一班", topic: "当前课题", topicName: "当前课题", topicDesc: "描述",
            populationSize: 8000, weightConfig: null, status: "submitted", submittedAt: new Date(), submissionSnapshot: snapshot,
            reportContent: "当前报告", samplePlan: null, questionnaire: null, samplingResults: null,
            scoreQuestionnaire: null, scoreProcess: null, scoreReport: null, totalScore: null, teacherComment: null, rejectReason: null, gradedAt: null, gradedByName: null,
        }],
        [{ id: 5, method: "simple", seed: 2026, sampleCount: 240, details: { completed: true }, createdAt: attemptTime }],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?detail=${crypto.randomUUID()}`);
    const response = await module.gradingDetailRoutes.GET!(withId(new Request("https://example.com"), "99"));
    const payload = await response.json() as any;
    expect(payload.data).toMatchObject({ version: 7, studentName: "提交时学生", topicName: "提交时课题", populationSize: 7200, reportContent: "提交时报告" });
    expect(payload.data.samplePlan).toMatchObject({ finalSampleSize: 240, designEffect: 1, nonResponseRate: 0 });
    expect(payload.data.weights).toEqual({ questionnaire: 40, process: 35, report: 25 });
    expect(payload.data.samplingPolicy).toEqual(snapshot.samplingPolicy);
    expect(payload.data.analysisAppendices).toEqual(snapshot.analysisAppendices);
    expect(payload.data.samplingAttempts).toEqual([{
        id: 5,
        method: "simple",
        seed: 2026,
        sampleCount: 240,
        details: { completed: true },
        createdAt: attemptTime.toISOString(),
    }]);
    expect(payload.data).not.toHaveProperty("pdfStatus");
});

test("compact grading detail rejects hydration when the frozen source hash cannot be verified", async () => {
    const { db } = createMockDb({ select: [
        [{
            id: 99, version: 7, studentName: "当前学生", studentId: "S001", className: "统计一班", topic: "当前课题", topicName: "当前课题", topicDesc: "描述",
            populationSize: 2, excelFilePath: `/storage/missing-${crypto.randomUUID()}.csv`, weightConfig: null,
            status: "submitted", submittedAt: new Date(),
            submissionSnapshot: { samplingResults: { simple: { completed: true, sampleCount: 1, indices: [0] } } },
            reportContent: "当前报告", samplePlan: null, questionnaire: null, samplingResults: null,
            scoreQuestionnaire: null, scoreProcess: null, scoreReport: null, totalScore: null,
            teacherComment: null, rejectReason: null, gradedAt: null, gradedByName: null,
        }],
        [],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?read-failed=${crypto.randomUUID()}`);
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
        const response = await module.gradingDetailRoutes.GET!(withId(new Request("https://example.com"), "99"));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: { code: "SOURCE_CONFLICT" } });
    } finally {
        console.error = originalConsoleError;
    }
});

test("teacher sampling export returns every row from the immutable submission snapshot", async () => {
    const submittedRows = Array.from({ length: 60 }, (_, index) => ({
        rowId: index + 1,
        source: `提交-${index + 1}`,
    }));
    const { db } = createMockDb({ select: [[{
        id: 99,
        status: "submitted",
        excelFilePath: null,
        submissionSnapshot: {
            samplingResults: {
                simple: { completed: true, sampleCount: 60, data: submittedRows },
            },
        },
        samplingResults: {
            simple: { completed: true, sampleCount: 1, data: [{ rowId: 1, source: "当前值" }] },
        },
    }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?sampling-export=${crypto.randomUUID()}`);

    const response = await module.gradingSamplingExportRoutes.GET!(withId(
        new Request("https://example.com/api/teacher/grading/99/sampling-export?type=all"),
        "99",
    ));
    expect([...new Uint8Array(await response.clone().arrayBuffer()).slice(0, 3)]).toEqual([239, 187, 191]);
    const csv = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("all_sampling.csv");
    expect(csv.split("\n")).toHaveLength(61);
    expect(csv).toContain("提交-60");
    expect(csv).not.toContain("当前值");
});
