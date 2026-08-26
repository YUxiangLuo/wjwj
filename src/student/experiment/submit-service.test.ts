import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { experiment } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

function validQuestionnaire() {
    return {
        title: "教学问卷",
        welcomeText: "<p>欢迎参加本次抽样调查，请根据实际情况认真填写。</p>",
        endingText: "<p>感谢完成本次抽样调查，您的回答仅用于课堂教学。</p>",
        questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, type: "boolean", content: `这是第${index + 1}个调查问题吗？` })),
    };
}

function validRecord(status: "in_progress" | "rejected" = "in_progress") {
    const now = new Date();
    return {
        id: 9,
        studentId: 2,
        taskId: 3,
        version: 4,
        currentStage: 4,
        status,
        questionnaire: validQuestionnaire(),
        samplePlan: { confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 132, finalSampleSize: 50 },
        samplingResults: {
            simple: { completed: true, sampleCount: 50 },
            systematic: { completed: true, sampleCount: 50, kValue: 2 },
            pps: { completed: true, sampleCount: 50, sizeField: "规模" },
            stratified: { completed: true, stratifyBy: "分组", layers: [{ name: "A", sampleCount: 25 }, { name: "B", sampleCount: 25 }] },
        },
        reportContent: `<p>${"这是用于课堂教学的完整分析报告内容。".repeat(12)}</p>`,
        stage1CompletedAt: now,
        stage2CompletedAt: now,
        stage3CompletedAt: now,
        stage4CompletedAt: now,
        submissionSnapshot: null,
        submittedAt: null,
        scoreQuestionnaire: status === "rejected" ? "80" : null,
        scoreProcess: null,
        scoreReport: null,
        totalScore: status === "rejected" ? "80" : null,
        teacherComment: status === "rejected" ? "旧评语" : null,
        rejectReason: status === "rejected" ? "请修改" : null,
        gradedByTeacherId: null,
        gradedAt: null,
        createdAt: now,
        updatedAt: now,
    } as any;
}

test("submit overwrites the same experiment and stores a grading snapshot", async () => {
    const { db, operations } = createMockDb({ update: [[{ id: 9 }]] });
    mock.module("../../db", () => ({ db }));
    const { submitStudentExperiment } = await import(`./submit-service.ts?submit=${crypto.randomUUID()}`);
    const result = await submitStudentExperiment({
        experimentRecord: validRecord("rejected"),
        observedVersion: 4,
        taskInfo: {
            topicName: "抽样调查",
            populationSize: 200,
            weightConfig: { questionnaire: 40, process: 35, report: 25 },
        },
        student: { studentId: "S001", name: "学生一" },
    });

    expect(result).toMatchObject({ ok: true, experimentId: 9 });
    expect(operations.filter((item) => item.kind === "insert")).toHaveLength(0);
    const update = operations.find((item) => item.kind === "update" && item.table === experiment);
    expect(update?.set).toMatchObject({
        status: "submitted",
        version: 5,
        totalScore: null,
        teacherComment: null,
        rejectReason: null,
        submissionSnapshot: {
            topicName: "抽样调查",
            studentName: "学生一",
            weightConfig: { questionnaire: 40, process: 35, report: 25 },
        },
    });
    const condition = new PgDialect().sqlToQuery(update!.where as SQL);
    expect(condition.params).toEqual([9, 4, "rejected", 4]);
});

test("submit rejects a stale experiment record when the conditional update changes no rows", async () => {
    const { db } = createMockDb({ update: [[]] });
    mock.module("../../db", () => ({ db }));
    const { submitStudentExperiment } = await import(`./submit-service.ts?conflict=${crypto.randomUUID()}`);
    const result = await submitStudentExperiment({
        experimentRecord: validRecord(),
        observedVersion: 4,
        taskInfo: {
            topicName: "抽样调查",
            populationSize: 200,
            weightConfig: { questionnaire: 40, process: 35, report: 25 },
        },
        student: { studentId: "S001", name: "学生一" },
    });

    expect(result).toMatchObject({ ok: false, code: "VERSION_CONFLICT", status: 409 });
});

test("submit rejects a version that was already stale when the request began", async () => {
    const { db, operations } = createMockDb();
    mock.module("../../db", () => ({ db }));
    const { submitStudentExperiment } = await import(`./submit-service.ts?stale=${crypto.randomUUID()}`);
    const result = await submitStudentExperiment({
        experimentRecord: validRecord(),
        observedVersion: 3,
        taskInfo: { topicName: "抽样调查", populationSize: 200 },
        student: { studentId: "S001", name: "学生一" },
    });

    expect(result).toMatchObject({ ok: false, code: "VERSION_CONFLICT", status: 409 });
    expect(operations.filter((item) => item.kind === "update")).toHaveLength(0);
});

test("an already-submitted retry accepts the older version without another write", async () => {
    const { db, operations } = createMockDb();
    mock.module("../../db", () => ({ db }));
    const { submitStudentExperiment } = await import(`./submit-service.ts?idempotent=${crypto.randomUUID()}`);
    const result = await submitStudentExperiment({
        experimentRecord: {
            ...validRecord(),
            version: 5,
            status: "submitted",
            submittedAt: new Date("2026-01-01T00:00:00Z"),
        },
        observedVersion: 4,
        taskInfo: { topicName: "抽样调查", populationSize: 200 },
        student: { studentId: "S001", name: "学生一" },
    });

    expect(result).toMatchObject({ ok: true, experimentId: 9 });
    expect(operations.filter((item) => item.kind === "update")).toHaveLength(0);
});
