import { describe, expect, test } from "bun:test";
import { buildExperimentSaveUpdates } from "./update-service";
import { ExperimentStatus } from "./status";

function createExperimentRecord(overrides: Record<string, unknown> = {}) {
    return {
        id: 88,
        taskId: 40,
        studentId: 11,
        status: ExperimentStatus.IN_PROGRESS,
        version: 3,
        currentStage: 4,
        questionnaire: JSON.stringify({
            title: "问卷标题",
            welcomeText: "欢迎参加本次调查，请根据真实情况完成问卷填写。",
            endingText: "感谢参与。",
            questions: [
                { id: "q1", type: "single", content: "题目1", options: ["A", "B"] },
                { id: "q2", type: "single", content: "题目2", options: ["A", "B"] },
                { id: "q3", type: "single", content: "题目3", options: ["A", "B"] },
                { id: "q4", type: "single", content: "题目4", options: ["A", "B"] },
                { id: "q5", type: "single", content: "题目5", options: ["A", "B"] },
            ],
        }),
        samplePlan: JSON.stringify({
            confidenceLevel: "95",
            marginOfError: 5,
            recommendedSize: 132,
            finalSampleSize: 50,
        }),
        samplingResults: JSON.stringify({
            simple: { completed: true, sampleCount: 50, data: [{ id: 1 }] },
            systematic: { completed: true, kValue: 4, sampleCount: 48, data: [{ id: 2 }] },
            pps: { completed: true, sizeField: "income", sampleCount: 50, data: [{ id: 3 }] },
            stratified: {
                completed: true,
                stratifyBy: "grade",
                layers: [
                    { name: "A", count: 60, ratio: 0.6, sampleCount: 30 },
                    { name: "B", count: 40, ratio: 0.4, sampleCount: 20 },
                ],
                data: [{ id: 4 }],
            },
        }),
        reportContent: "<p>已有报告内容</p>",
        stage1CompletedAt: new Date("2026-03-01T00:00:00.000Z"),
        stage2CompletedAt: new Date("2026-03-02T00:00:00.000Z"),
        stage3CompletedAt: new Date("2026-03-03T00:00:00.000Z"),
        stage4CompletedAt: new Date("2026-03-04T00:00:00.000Z"),
        ...overrides,
    };
}

describe("buildExperimentSaveUpdates", () => {
    test("editing sample plan clears downstream sampling and report state", () => {
        const result = buildExperimentSaveUpdates({
            experimentRecord: createExperimentRecord() as any,
            body: {
                samplePlan: {
                    confidenceLevel: "95",
                    marginOfError: 5,
                    recommendedSize: 132,
                    finalSampleSize: 60,
                },
            },
            populationSize: 200,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.updates).toMatchObject({
            currentStage: 2,
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 5,
                recommendedSize: 132,
                finalSampleSize: 60,
                calculatedSampleSize: 132,
            },
            samplingResults: null,
            reportContent: null,
            stage3CompletedAt: null,
            stage4CompletedAt: null,
        });
    });

    test("editing sampling results clears only report state", () => {
        const result = buildExperimentSaveUpdates({
            experimentRecord: createExperimentRecord() as any,
            body: {
                samplingResults: {
                    simple: { completed: true, sampleCount: 60, data: [{ id: 10 }] },
                },
            },
            populationSize: 200,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.updates).toMatchObject({
            currentStage: 3,
            samplingResults: {
                simple: { completed: true, sampleCount: 60, data: [{ id: 10 }] },
            },
            reportContent: null,
            stage4CompletedAt: null,
        });
        expect(result.updates.stage3CompletedAt).toBeUndefined();
    });
});
