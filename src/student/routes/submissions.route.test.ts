import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function withId(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

test("submission endpoint returns the task's current experiment result", async () => {
    const { db } = createMockDb({ select: [[{
        id: 501,
        taskId: 40,
        topicId: 12,
        topicName: "抽样调查",
        submittedAt: new Date("2026-03-08T08:00:00Z"),
        status: "graded",
        scoreQuestionnaire: "88.00",
        scoreProcess: "90.00",
        scoreReport: "91.00",
        totalScore: "89.90",
        teacherComment: "完成良好",
        rejectReason: null,
        gradedAt: new Date("2026-03-08T10:00:00Z"),
        graderName: "王老师",
        weightConfig: { questionnaire: 30, process: 30, report: 40 },
        submissionSnapshot: { weightConfig: { questionnaire: 40, process: 35, report: 25 } },
    }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({ requireAuth: async () => ({ student: { id: 11, classId: 7 }, error: null }) }));
    mock.module("../experiment/task-access", () => ({ getStudentTaskAccessError: async () => null }));
    const module = await import(`./submissions.ts?result=${crypto.randomUUID()}`);

    const response = await module.submissionByTaskRoutes.GET!(withId(new Request("https://example.com/api/student/tasks/40/submission"), "40"));
    const payload = await response.json() as any;
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({ id: 501, taskId: 40, status: "graded", totalScore: 89.9, graderName: "王老师" });
    expect(payload.data.weights).toEqual({ questionnaire: 40, process: 35, report: 25 });
    expect(payload.data).not.toHaveProperty("pdfStatus");
});

test("in-progress experiment is not exposed as a result", async () => {
    const { db } = createMockDb({ select: [[{ id: 501, taskId: 40, status: "in_progress" }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({ requireAuth: async () => ({ student: { id: 11, classId: 7 }, error: null }) }));
    mock.module("../experiment/task-access", () => ({ getStudentTaskAccessError: async () => null }));
    const module = await import(`./submissions.ts?missing=${crypto.randomUUID()}`);
    const response = await module.submissionByTaskRoutes.GET!(withId(new Request("https://example.com"), "40"));
    expect(response.status).toBe(404);
});
