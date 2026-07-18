import { expect, mock, test } from "bun:test";
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
        samplingResults: { simple: { completed: true, sampleCount: 240 } },
        reportContent: "提交时报告",
        weightConfig: { questionnaire: 40, process: 35, report: 25 },
    };
    const { db } = createMockDb({ select: [[{
        id: 99, studentName: "当前学生", studentId: "S001", className: "统计一班", topic: "当前课题", topicName: "当前课题", topicDesc: "描述",
        populationSize: 8000, weightConfig: null, status: "submitted", submittedAt: new Date(), submissionSnapshot: snapshot,
        reportContent: "当前报告", samplePlan: null, questionnaire: null, samplingResults: null,
        scoreQuestionnaire: null, scoreProcess: null, scoreReport: null, totalScore: null, teacherComment: null, rejectReason: null, gradedAt: null, gradedByName: null,
    }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({ getTeacherUser: () => ({ id: 9, type: "teacher", name: "教师", employeeId: "T001" }) }));
    const module = await import(`./grading.ts?detail=${crypto.randomUUID()}`);
    const response = await module.gradingDetailRoutes.GET!(withId(new Request("https://example.com"), "99"));
    const payload = await response.json() as any;
    expect(payload.data).toMatchObject({ studentName: "提交时学生", topicName: "提交时课题", populationSize: 7200, reportContent: "提交时报告" });
    expect(payload.data.samplePlan).toMatchObject({ finalSampleSize: 240, designEffect: 1, nonResponseRate: 0 });
    expect(payload.data.weights).toEqual({ questionnaire: 40, process: 35, report: 25 });
    expect(payload.data).not.toHaveProperty("pdfStatus");
});
