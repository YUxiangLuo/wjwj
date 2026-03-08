import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadSubmissionRoutes(selectQueue: unknown[]) {
    const { db } = createMockDb({ select: selectQueue });

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        requireAuth: async () => ({
            student: {
                id: 11,
                classId: 7,
                name: "Alice",
                studentId: "20230001",
                status: 1,
                isFirstLogin: 0,
            },
            error: null,
            sessionExpiresAt: null,
        }),
    }));

    return import("./submissions");
}

test("submission detail exposes pending pdf state and message", async () => {
    const module = await loadSubmissionRoutes([
        [{
            id: 501,
            submittedAt: new Date("2026-03-08T08:00:00.000Z"),
            status: 1,
            scoreQuestionnaire: null,
            scoreProcess: null,
            scoreReport: null,
            totalScore: null,
            teacherComment: null,
            rejectReason: null,
            gradedAt: null,
            gradedByType: null,
            gradedById: null,
            questionnairePdfPath: null,
            reportPdfPath: null,
            pdfStatus: 0,
            pdfGenerationAttempts: 0,
            taskId: 40,
            topicId: 12,
            topicName: "抽样调查",
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        }],
    ]);

    const response = await module.submissionDetailRoutes.GET!(withRouteParam(
        new Request("https://example.com/api/student/submissions/501", { method: "GET" }),
        "501"
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
        id: 501,
        pdfStatus: "pending",
        pdfStatusMessage: "PDF 已加入生成队列，请稍后刷新。",
        questionnairePdfPath: null,
        reportPdfPath: null,
    });
});

test("submission detail reports ready pdf state when both file paths exist", async () => {
    const module = await loadSubmissionRoutes([
        [{
            id: 502,
            submittedAt: new Date("2026-03-08T09:00:00.000Z"),
            status: 2,
            scoreQuestionnaire: "88.00",
            scoreProcess: "90.00",
            scoreReport: "91.00",
            totalScore: "89.90",
            teacherComment: "完成良好",
            rejectReason: null,
            gradedAt: new Date("2026-03-08T10:00:00.000Z"),
            gradedByType: null,
            gradedById: null,
            questionnairePdfPath: "/storage/uploads/submissions/502-questionnaire.pdf",
            reportPdfPath: "/storage/uploads/submissions/502-report.pdf",
            pdfStatus: 0,
            pdfGenerationAttempts: 1,
            taskId: 40,
            topicId: 12,
            topicName: "抽样调查",
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        }],
    ]);

    const response = await module.submissionDetailRoutes.GET!(withRouteParam(
        new Request("https://example.com/api/student/submissions/502", { method: "GET" }),
        "502"
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
        id: 502,
        pdfStatus: "ready",
        pdfStatusMessage: null,
        questionnairePdfPath: "/storage/uploads/submissions/502-questionnaire.pdf",
        reportPdfPath: "/storage/uploads/submissions/502-report.pdf",
    });
});
