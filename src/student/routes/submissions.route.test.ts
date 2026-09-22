import { unlink } from "node:fs/promises";
import { expect, mock, test } from "bun:test";
import { createStudentAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withId(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

test("submission endpoint returns the task's current experiment result", async () => {
    const { db } = createMockDb({ select: [[{
        id: 501,
        taskId: 40,
        version: 12,
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
        populationSize: 1000,
        questionnaire: { title: "实时问卷" },
        samplePlan: { finalSampleSize: 80 },
        samplingResults: { simple: { completed: true, sampleCount: 80, data: Array.from({ length: 80 }, () => ({})) } },
        reportContent: "<p>实时报告</p>",
        submissionSnapshot: {
            topicName: "提交时课题",
            studentName: "提交时姓名",
            populationSize: 900,
            questionnaire: { title: "提交时问卷", questions: [] },
            samplePlan: { finalSampleSize: 60 },
            samplingResults: { simple: { completed: true, sampleCount: 60, data: Array.from({ length: 60 }, () => ({})) } },
            reportContent: "<p>提交时报告</p>",
            weightConfig: { questionnaire: 40, process: 35, report: 25 },
            analysisAppendices: [{ id: 7, stale: false }],
        },
    }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock());
    mock.module("../experiment/task-access", () => ({
        getStudentTaskAccessError: async () => null,
        getStudentTopicAttachmentAccessError: async () => null,
    }));
    const module = await import(`./submissions.ts?result=${crypto.randomUUID()}`);

    const response = await module.submissionByTaskRoutes.GET!(withId(new Request("https://example.com/api/student/tasks/40/submission"), "40"));
    const payload = await response.json() as any;
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
        id: 501,
        taskId: 40,
        version: 12,
        status: "graded",
        topicName: "提交时课题",
        scoreQuestionnaire: 88,
        scoreProcess: 90,
        scoreReport: 91,
        totalScore: 89.9,
        graderName: "王老师",
        snapshot: {
            topicName: "提交时课题",
            studentName: "提交时姓名",
            populationSize: 900,
            questionnaire: { title: "提交时问卷" },
            samplePlan: { finalSampleSize: 60 },
            samplingResults: { simple: { sampleCount: 60 } },
            reportContent: "<p>提交时报告</p>",
            analysisAppendices: [{ id: 7, stale: false }],
        },
    });
    expect(payload.data.weights).toEqual({ questionnaire: 40, process: 35, report: 25 });
    expect(payload.data).not.toHaveProperty("pdfStatus");
});

test("submission endpoint hydrates compact immutable snapshot samples", async () => {
    const populationPath = `/storage/compact-submission-${crypto.randomUUID()}.csv`;
    const absolutePath = `${process.cwd()}${populationPath}`;
    await Bun.write(absolutePath, "id,city\n1,北京\n2,上海\n");
    const hash = new Bun.CryptoHasher("sha256").update(await Bun.file(absolutePath).arrayBuffer()).digest("hex");

    try {
        const { db } = createMockDb({ select: [[{
            id: 501,
            taskId: 40,
            version: 12,
            topicId: 12,
            topicName: "抽样调查",
            submittedAt: new Date(),
            status: "submitted",
            scoreQuestionnaire: null,
            scoreProcess: null,
            scoreReport: null,
            totalScore: null,
            teacherComment: null,
            rejectReason: null,
            gradedAt: null,
            graderName: null,
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
            populationSize: 2,
            excelFilePath: populationPath,
            submissionSnapshot: {
                populationFileSha256: hash,
                samplingResults: { simple: { completed: true, sampleCount: 1, indices: [1] } },
            },
        }]] });
        mock.module("../../db", () => ({ db }));
        mock.module("./auth", () => createStudentAuthModuleMock());
        mock.module("../experiment/task-access", () => ({
            getStudentTaskAccessError: async () => null,
            getStudentTopicAttachmentAccessError: async () => null,
        }));
        const module = await import(`./submissions.ts?compact=${crypto.randomUUID()}`);
        const response = await module.submissionByTaskRoutes.GET!(withId(new Request("https://example.com"), "40"));
        const payload = await response.json() as any;
        expect(payload.data.snapshot.samplingResults.simple.data).toEqual([{ id: "2", city: "上海" }]);
        expect(payload.data.snapshot.samplingResults.simple).not.toHaveProperty("indices");
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});

test("compact submission rejects hydration when the frozen source hash cannot be verified", async () => {
    const { db } = createMockDb({ select: [[{
        id: 501,
        taskId: 40,
        version: 12,
        topicId: 12,
        topicName: "抽样调查",
        submittedAt: new Date(),
        status: "submitted",
        scoreQuestionnaire: null,
        scoreProcess: null,
        scoreReport: null,
        totalScore: null,
        teacherComment: null,
        rejectReason: null,
        gradedAt: null,
        graderName: null,
        weightConfig: { questionnaire: 30, process: 30, report: 40 },
        populationSize: 2,
        excelFilePath: `/storage/missing-${crypto.randomUUID()}.csv`,
        submissionSnapshot: {
            samplingResults: { simple: { completed: true, sampleCount: 1, indices: [1] } },
        },
    }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock());
    mock.module("../experiment/task-access", () => ({
        getStudentTaskAccessError: async () => null,
        getStudentTopicAttachmentAccessError: async () => null,
    }));
    const module = await import(`./submissions.ts?read-failed=${crypto.randomUUID()}`);
    const originalConsoleError = console.error;
    console.error = () => undefined;
    try {
        const response = await module.submissionByTaskRoutes.GET!(withId(new Request("https://example.com"), "40"));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: { code: "SOURCE_CONFLICT" } });
    } finally {
        console.error = originalConsoleError;
    }
});

test("in-progress experiment is not exposed as a result", async () => {
    const { db } = createMockDb({ select: [[{ id: 501, taskId: 40, status: "in_progress" }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createStudentAuthModuleMock());
    mock.module("../experiment/task-access", () => ({
        getStudentTaskAccessError: async () => null,
        getStudentTopicAttachmentAccessError: async () => null,
    }));
    const module = await import(`./submissions.ts?missing=${crypto.randomUUID()}`);
    const response = await module.submissionByTaskRoutes.GET!(withId(new Request("https://example.com"), "40"));
    expect(response.status).toBe(404);
});
