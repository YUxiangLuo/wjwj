import { expect, mock, test } from "bun:test";
import { calculateMeanEstimationSampleSize } from "../experiment/sample-plan";
import { createMockDb } from "../../test-utils/mock-db";

function createJsonRequest(url: string, method: string, body?: unknown, headers?: HeadersInit) {
    return new Request(url, {
        method,
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadExperimentRoutes(options: {
    select?: unknown[];
    insert?: unknown[];
    update?: unknown[];
    delete?: unknown[];
    authStudent?: Record<string, unknown>;
} = {}) {
    const { db, operations } = createMockDb(options);

    mock.restore();
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
                ...options.authStudent,
            },
            error: null,
            sessionExpiresAt: null,
        }),
    }));
    mock.module("../experiment/submission-pdf", () => ({
        kickSubmissionPdfProcessing: () => undefined,
    }));

    const module = await import("./experiment");
    return { module, operations };
}

function buildValidQuestionnaire() {
    return {
        title: "抽样调查问卷",
        welcomeText: "欢迎参加本次抽样调查实验，请根据实际情况认真填写问卷内容，谢谢配合。",
        endingText: "问卷到此结束，感谢你的参与和配合，祝你学习顺利。",
        questions: [
            { id: "q1", type: "single", content: "你是否了解抽样调查？", options: ["了解", "不了解"] },
            { id: "q2", type: "multiple", content: "你常用哪些数据分析工具？", options: ["Excel", "SPSS", "R"], minSelect: 1, maxSelect: 2 },
            { id: "q3", type: "scale", content: "你对统计课程的兴趣程度如何？", scaleMin: 1, scaleMax: 5 },
            { id: "q4", type: "boolean", content: "你是否做过问卷调查？" },
            { id: "q5", type: "single", content: "你认为样本量规划是否重要？", options: ["重要", "一般"] },
        ],
    };
}

function buildValidSamplePlan() {
    return {
        confidenceLevel: "95",
        marginOfError: 5,
        recommendedSize: 132,
        finalSampleSize: 50,
    };
}

function buildValidSamplingResults() {
    return {
        simple: { completed: true, sampleCount: 50, seed: 1, data: [{ id: 1 }] },
        systematic: { completed: true, kValue: 4, sampleCount: 48, seed: 2, data: [{ id: 2 }] },
        pps: { completed: true, sizeField: "income", sampleCount: 50, seed: 4, data: [{ id: 4 }] },
        stratified: {
            completed: true,
            stratifyBy: "grade",
            layers: [
                { name: "A", count: 60, ratio: 0.6, sampleCount: 30 },
                { name: "B", count: 40, ratio: 0.4, sampleCount: 20 },
            ],
            seed: 3,
            data: [{ id: 3 }],
        },
    };
}

test("experiment get parses serialized questionnaire, sample plan, and sampling results", async () => {
    const questionnaire = buildValidQuestionnaire();
    const samplePlan = buildValidSamplePlan();
    const samplingResults = buildValidSamplingResults();

    const { module } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [{
                id: 88,
                studentId: 11,
                taskId: 40,
                currentStage: 4,
                status: 0,
                questionnaire: JSON.stringify(questionnaire),
                samplePlan: JSON.stringify(samplePlan),
                samplingResults: JSON.stringify(samplingResults),
                reportContent: "报告内容",
                lastSavedAt: new Date("2026-03-05T08:00:00.000Z"),
            }],
            [{ openTime: null, deadline: new Date(Date.now() + 3600_000) }],
            [{ id: 40, topicId: 12 }],
            [{ excelRowCount: 200 }],
        ],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/experiment",
        "GET"
    ), "40");

    const response = await module.experimentRoutes.GET!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
        id: 88,
        taskId: 40,
        currentStage: 4,
        questionnaire,
        samplePlan,
        samplingResults,
        reportContent: "报告内容",
        populationSize: 200,
        lastSavedAt: "2026-03-05T08:00:00.000Z",
    });
});

test("experiment get blocks unopened tasks before creating experiment records", async () => {
    const { module, operations } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [],
            [{ openTime: new Date(Date.now() + 3600_000), deadline: new Date(Date.now() + 7200_000) }],
        ],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/experiment",
        "GET"
    ), "40");

    const response = await module.experimentRoutes.GET!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "TASK_NOT_OPEN",
            message: "任务尚未开放",
        },
    });
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});

test("experiment get allows reading existing experiment data after deadline without creating a new record", async () => {
    const questionnaire = buildValidQuestionnaire();

    const { module, operations } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [{
                id: 88,
                studentId: 11,
                taskId: 40,
                currentStage: 2,
                status: 0,
                questionnaire: JSON.stringify(questionnaire),
                samplePlan: null,
                samplingResults: null,
                reportContent: "已保存的截止后内容",
                lastSavedAt: new Date("2026-03-05T08:00:00.000Z"),
            }],
            [{ openTime: null, deadline: new Date(Date.now() - 3600_000) }],
            [{ id: 40, topicId: 12 }],
            [{ excelRowCount: 200 }],
        ],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/experiment",
        "GET"
    ), "40");

    const response = await module.experimentRoutes.GET!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
        id: 88,
        taskId: 40,
        currentStage: 2,
        questionnaire,
        reportContent: "已保存的截止后内容",
        populationSize: 200,
    });
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});

test("experiment save updates stage and recalculates sample size", async () => {
    const { module, operations } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [{
                id: 88,
                studentId: 11,
                taskId: 40,
                currentStage: 1,
                status: 0,
                version: 3,
                questionnaire: JSON.stringify(buildValidQuestionnaire()),
                stage1CompletedAt: new Date("2026-03-01T00:00:00.000Z"),
                stage2CompletedAt: null,
                stage3CompletedAt: null,
                stage4CompletedAt: null,
            }],
            [{ openTime: null, deadline: new Date(Date.now() + 3600_000) }],
            [{ topicId: 12, excelRowCount: 200 }],
        ],
        update: [[{ affectedRows: 1 }]],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/experiment",
        "PUT",
        {
            currentStage: 2,
            samplePlan: {
                advancedPlanSource: "cv",
                confidenceLevel: "95",
                marginOfError: 5,
                finalSampleSize: 50,
            },
        }
    ), "40");

    const response = await module.experimentRoutes.PUT!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
        id: 88,
        taskId: 40,
        currentStage: 2,
        status: 0,
        questionnaire: buildValidQuestionnaire(),
        samplePlan: {
            advancedPlanSource: "cv",
            confidenceLevel: "95",
            marginOfError: 5,
            finalSampleSize: 50,
            calculatedSampleSize: 132,
        },
        samplingResults: null,
        reportContent: null,
        populationSize: 200,
        lastSavedAt: expect.any(String),
    });

    const updateOperation = operations.find((operation) => operation.kind === "update");
    expect(updateOperation?.set).toMatchObject({
        currentStage: 2,
        version: 4,
        stage2CompletedAt: expect.any(Date),
        samplePlan: {
            advancedPlanSource: "cv",
            confidenceLevel: "95",
            marginOfError: 5,
            finalSampleSize: 50,
            calculatedSampleSize: 132,
        },
    });
});

test("experiment save recalculates sample size with mean formula", async () => {
    const calculatedSampleSize = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 200,
        populationVariance: 100,
    });

    const { module } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [{
                id: 88,
                studentId: 11,
                taskId: 40,
                currentStage: 1,
                status: 0,
                version: 3,
                questionnaire: JSON.stringify(buildValidQuestionnaire()),
                stage1CompletedAt: new Date("2026-03-01T00:00:00.000Z"),
                stage2CompletedAt: null,
                stage3CompletedAt: null,
                stage4CompletedAt: null,
            }],
            [{ openTime: null, deadline: new Date(Date.now() + 3600_000) }],
            [{ topicId: 12, excelRowCount: 200 }],
        ],
        update: [[{ affectedRows: 1 }]],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/experiment",
        "PUT",
        {
            currentStage: 2,
            samplePlan: {
                estimationType: "mean",
                confidenceLevel: "95",
                marginOfError: 2,
                populationVariance: 100,
                finalSampleSize: 50,
            },
        },
    ), "40");

    const response = await module.experimentRoutes.PUT!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.samplePlan).toMatchObject({
        estimationType: "mean",
        confidenceLevel: "95",
        marginOfError: 2,
        populationVariance: 100,
        finalSampleSize: 50,
        calculatedSampleSize,
    });
});

test("experiment save blocks invalid sample plan when advancing to stage 3", async () => {
    const { module, operations } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [{
                id: 88,
                studentId: 11,
                taskId: 40,
                currentStage: 2,
                status: 0,
                version: 3,
                questionnaire: JSON.stringify(buildValidQuestionnaire()),
                samplePlan: JSON.stringify(buildValidSamplePlan()),
                stage1CompletedAt: new Date("2026-03-01T00:00:00.000Z"),
                stage2CompletedAt: new Date("2026-03-02T00:00:00.000Z"),
                stage3CompletedAt: null,
                stage4CompletedAt: null,
            }],
            [{ openTime: null, deadline: new Date(Date.now() + 3600_000) }],
            [{ topicId: 12, excelRowCount: 200 }],
        ],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/experiment",
        "PUT",
        {
            currentStage: 3,
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 5,
                recommendedSize: 132,
                finalSampleSize: 201,
            },
        }
    ), "40");

    const response = await module.experimentRoutes.PUT!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "最终样本量需在 1～200 人之间",
        },
    });
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);
});

test("experiment submit blocks incomplete experiments before any writes", async () => {
    const { module, operations } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [{
                id: 88,
                studentId: 11,
                taskId: 40,
                currentStage: 3,
                status: 0,
                version: 3,
            }],
            [{
                openTime: null,
                deadline: new Date(Date.now() + 3600_000),
                topicName: "抽样调查",
                populationSize: 200,
                teacherId: 21,
                classId: 7,
            }],
        ],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/submit",
        "POST"
    ), "40");

    const response = await module.submitRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "INCOMPLETE",
            message: "请完成所有实验阶段后再提交",
        },
    });
    expect(operations.filter((operation) => operation.kind === "update" || operation.kind === "insert")).toHaveLength(0);
});

test("experiment submit marks experiment submitted, inserts submission, and notifies teacher and assistants", async () => {
    const { module, operations } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [{
                id: 88,
                studentId: 11,
                taskId: 40,
                currentStage: 4,
                status: 0,
                version: 3,
                questionnaire: JSON.stringify(buildValidQuestionnaire()),
                samplePlan: JSON.stringify(buildValidSamplePlan()),
                samplingResults: JSON.stringify(buildValidSamplingResults()),
                reportContent: "这是实验报告正文，用于验证提交逻辑与通知逻辑是否按预期执行。".repeat(10),
            }],
            [{
                openTime: null,
                deadline: new Date(Date.now() + 3600_000),
                topicName: "抽样调查",
                populationSize: 200,
                teacherId: 21,
                classId: 7,
            }],
            [{ assistantId: 31 }, { assistantId: 32 }],
        ],
        update: [[{ affectedRows: 1 }]],
        insert: [[{ insertId: 501 }]],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/submit",
        "POST"
    ), "40");

    const response = await module.submitRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
        success: true,
        data: { success: true },
    });

    const experimentUpdate = operations.find((operation) => operation.kind === "update");
    expect(experimentUpdate?.set).toMatchObject({
        status: 1,
        version: 4,
        lastSavedAt: expect.any(Date),
    });

    const submissionInsert = operations.find((operation) => operation.kind === "insert" && (operation.values as any)?.experimentId === 88);
    expect(submissionInsert?.values).toMatchObject({
        experimentId: 88,
        pdfSnapshotQuestionnaire: buildValidQuestionnaire(),
        pdfSnapshotSamplingResults: buildValidSamplingResults(),
        pdfSnapshotSamplePlan: buildValidSamplePlan(),
        pdfSnapshotPopulationSize: 200,
        pdfSnapshotReportContent: "这是实验报告正文，用于验证提交逻辑与通知逻辑是否按预期执行。".repeat(10),
        pdfSnapshotTopicName: "抽样调查",
        pdfSnapshotStudentName: "Alice",
        status: 1,
        pdfStatus: 0,
        submittedAt: expect.any(Date),
    });

    const notificationInserts = operations.filter((operation) => operation.kind === "insert" && (operation.values as any)?.type === "NEW_SUBMISSION");
    expect(notificationInserts).toHaveLength(3);
    expect(notificationInserts.map((operation) => (operation.values as any)?.receiverType)).toEqual([2, 3, 3]);
    expect(notificationInserts.map((operation) => (operation.values as any)?.receiverId)).toEqual([21, 31, 32]);
});

test("experiment reset clears downstream progress and reopens rejected experiments", async () => {
    const questionnaire = buildValidQuestionnaire();
    const { module, operations } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [{
                id: 88,
                studentId: 11,
                taskId: 40,
                currentStage: 4,
                status: 3,
                version: 6,
                questionnaire,
                samplePlan: buildValidSamplePlan(),
                samplingResults: buildValidSamplingResults(),
                reportContent: "report",
                stage1CompletedAt: new Date("2026-03-01T00:00:00.000Z"),
                stage2CompletedAt: new Date("2026-03-02T00:00:00.000Z"),
                stage3CompletedAt: new Date("2026-03-03T00:00:00.000Z"),
                stage4CompletedAt: new Date("2026-03-04T00:00:00.000Z"),
            }],
            [{ openTime: null, deadline: new Date(Date.now() + 3600_000) }],
            [{ excelRowCount: 200 }],
        ],
        update: [[{ affectedRows: 1 }]],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/reset",
        "POST",
        { resetToStage: 1, clearQuestionnaire: false }
    ), "40");

    const response = await module.resetRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
        id: 88,
        taskId: 40,
        currentStage: 1,
        status: 0,
        questionnaire,
        samplePlan: null,
        samplingResults: null,
        reportContent: null,
        populationSize: 200,
        lastSavedAt: expect.any(String),
    });

    const updateOperation = operations.find((operation) => operation.kind === "update");
    expect(updateOperation?.set).toMatchObject({
        currentStage: 1,
        status: 0,
        version: 7,
        samplePlan: null,
        samplingResults: null,
        reportContent: null,
        stage2CompletedAt: null,
        stage3CompletedAt: null,
        stage4CompletedAt: null,
        lastSavedAt: expect.any(Date),
    });
});

test("experiment reset blocks submitted experiments before writing", async () => {
    const { module, operations } = await loadExperimentRoutes({
        select: [
            [{ id: 40 }],
            [{
                id: 88,
                studentId: 11,
                taskId: 40,
                currentStage: 4,
                status: 1,
                version: 6,
            }],
            [{ openTime: null, deadline: new Date(Date.now() + 3600_000) }],
        ],
    });

    const request = withRouteParam(createJsonRequest(
        "https://example.com/api/student/tasks/40/reset",
        "POST",
        { resetToStage: 2 }
    ), "40");

    const response = await module.resetRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "ALREADY_SUBMITTED",
            message: "实验已提交或批改，无法重置",
        },
    });
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);
});
