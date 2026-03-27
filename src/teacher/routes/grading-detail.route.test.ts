import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadGradingModule(options: {
    select?: unknown[];
    update?: unknown[];
    authUser?: { id: number; type: "teacher" | "assistant" };
} = {}) {
    mock.restore();
    const { db } = createMockDb({
        select: options.select ?? [],
        update: options.update ?? [],
    });

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        getCurrentUser: async () => options.authUser ?? { id: 1, type: "teacher" },
        ASSISTANT_USER_TYPE: 3,
        TEACHER_USER_TYPE: 2,
        isLockExpired: () => true,
        notifyStudentById: async () => undefined,
    }));

    const module = await import(`./grading.ts?detail=${Date.now()}`);
    return { module };
}

test("grading detail GET returns normalized sample plan instead of raw any-shaped data", async () => {
    const { module } = await loadGradingModule({
        select: [
            [{ id: 1 }],
            [{
                id: 99,
                studentName: "张三",
                studentId: "20230001",
                className: "1班",
                topicName: "测试课题",
                topicDesc: "描述",
                populationSize: 8000,
                weightConfig: null,
                status: 2,
                submittedAt: new Date("2026-03-08T08:00:00.000Z"),
                snapshotStudentName: "提交时张三",
                snapshotTopicName: "提交时课题",
                snapshotPopulationSize: 7200,
                snapshotQuestionnaire: {
                    title: "提交时问卷",
                    questions: [{ id: "q1", type: "single", content: "快照题目", options: ["A", "B"] }],
                },
                snapshotSamplingResults: {
                    simple: { completed: true, sampleCount: 240, data: [{ id: 1, name: "快照样本" }] },
                },
                snapshotSamplePlan: {
                    estimationType: "proportion",
                    advancedPlanSource: "multivar",
                    confidenceLevel: "90",
                    marginOfError: 4,
                    recommendedSize: 210,
                    finalSampleSize: 240,
                },
                snapshotReportContent: "提交时报告",
                lockedById: null,
                lockedByType: null,
                lockedAt: null,
                experimentId: 10,
                experimentStatus: 1,
                reportContent: "当前报告",
                samplePlan: {
                    estimationType: "mean",
                    advancedPlanSource: "cv",
                    confidenceLevel: "95",
                    marginOfError: 2,
                    populationVariance: 100,
                    finalSampleSize: 110,
                },
                questionnaire: null,
                samplingResults: {
                    simple: { completed: true, sampleCount: 999, data: [{ id: 2, name: "当前样本" }] },
                },
                questionnairePdfPath: null,
                reportPdfPath: null,
                pdfStatus: 0,
                pdfGenerationAttempts: 0,
                scoreQuestionnaire: null,
                scoreProcess: null,
                scoreReport: null,
                totalScore: null,
                teacherComment: null,
                rejectReason: null,
                gradedAt: null,
                gradedByType: null,
                gradedById: null,
            }],
        ],
    });

    const response = await module.gradingDetailRoutes.GET!(
        withRouteParam(new Request("https://example.com/api/teacher/grading/99"), "99")
    );
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.studentName).toBe("提交时张三");
    expect(payload.data.topicName).toBe("提交时课题");
    expect(payload.data.populationSize).toBe(7200);
    expect(payload.data.reportContent).toBe("提交时报告");
    expect(payload.data.questionnaire).toMatchObject({
        title: "提交时问卷",
        questions: [{ id: "q1", type: "single", content: "快照题目", options: ["A", "B"] }],
    });
    expect(payload.data.samplePlan).toMatchObject({
        estimationType: "proportion",
        advancedPlanSource: "multivar",
        confidenceLevel: "90",
        marginOfError: 4,
        recommendedSize: 210,
        finalSampleSize: 240,
        designEffect: 1,
        nonResponseRate: 0,
    });
    expect(payload.data.samplingResults).toMatchObject({
        simple: { completed: true, sampleCount: 240, data: [{ id: 1, name: "快照样本" }] },
    });
});
