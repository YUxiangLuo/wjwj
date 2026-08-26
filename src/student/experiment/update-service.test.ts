import { expect, test } from "bun:test";
import { buildStageCompletionUpdates, buildStageReopenUpdates } from "./update-service";

function record(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        studentId: 2,
        taskId: 3,
        version: 4,
        status: "in_progress",
        currentStage: 2,
        questionnaire: { title: "问卷" },
        samplePlan: null,
        samplingResults: null,
        reportContent: null,
        stage1CompletedAt: new Date("2026-01-01T00:00:00Z"),
        stage2CompletedAt: null,
        stage3CompletedAt: null,
        stage4CompletedAt: null,
        submissionSnapshot: null,
        submittedAt: null,
        scoreQuestionnaire: null,
        scoreProcess: null,
        scoreReport: null,
        totalScore: null,
        teacherComment: null,
        rejectReason: null,
        gradedByTeacherId: null,
        gradedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    } as any;
}

test("completing the current stage saves it and advances once", () => {
    const result = buildStageCompletionUpdates({
        experimentRecord: record(),
        stage: 2,
        payload: {
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 5,
                designEffect: 1,
                nonResponseRate: 0,
                recommendedSize: 132,
                finalSampleSize: 50,
            },
        },
        populationSize: 200,
        deadlinePassed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updates.currentStage).toBe(3);
    expect(result.updates.version).toBe(5);
    expect(result.updates.stage2CompletedAt).toBeInstanceOf(Date);
    expect(result.updates.samplePlan).toMatchObject({ finalSampleSize: 50 });
});

test("a stage cannot be saved out of order", () => {
    const result = buildStageCompletionUpdates({
        experimentRecord: record(),
        stage: 3,
        payload: {},
        populationSize: 200,
        deadlinePassed: false,
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_STAGE_ORDER" });
});

test("reopening a completed stage keeps that stage data and clears downstream data", () => {
    const savedPlan = { confidenceLevel: "95", marginOfError: 5, finalSampleSize: 50 };
    const result = buildStageReopenUpdates({
        experimentRecord: record({
            currentStage: 4,
            samplePlan: savedPlan,
            samplingResults: { simple: { completed: true } },
            reportContent: "报告内容",
            stage2CompletedAt: new Date(),
            stage3CompletedAt: new Date(),
            stage4CompletedAt: new Date(),
        }),
        stage: 2,
        deadlinePassed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.updates).toMatchObject({
        version: 5,
        currentStage: 2,
        stage2CompletedAt: null,
        samplingResults: null,
        reportContent: null,
        stage3CompletedAt: null,
        stage4CompletedAt: null,
    });
    expect(result.updates.samplePlan).toBeUndefined();
});
