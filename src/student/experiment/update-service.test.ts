import { expect, test } from "bun:test";
import { buildExperimentSaveUpdates } from "./update-service";

function buildExperimentRecord(overrides: Record<string, unknown> = {}) {
    return {
        status: 0,
        currentStage: 4,
        version: 3,
        questionnaire: null,
        samplePlan: JSON.stringify({
            confidenceLevel: "95",
            marginOfError: 5,
            finalSampleSize: 50,
        }),
        samplingResults: JSON.stringify({
            simple: { completed: true, sampleCount: 50 },
            systematic: { completed: true, sampleCount: 48, kValue: 4 },
            pps: { completed: true, sampleCount: 50, sizeField: "income" },
            stratified: {
                completed: true,
                stratifyBy: "gender",
                layers: [
                    { name: "男", sampleCount: 25 },
                    { name: "女", sampleCount: 25 },
                ],
            },
        }),
        reportContent: "已完成分析报告",
        stage3CompletedAt: new Date("2026-03-03T00:00:00.000Z"),
        stage4CompletedAt: new Date("2026-03-04T00:00:00.000Z"),
        ...overrides,
    } as any;
}

test("changing final sample size invalidates downstream results and rolls the experiment back to stage 3", () => {
    const result = buildExperimentSaveUpdates({
        experimentRecord: buildExperimentRecord(),
        body: {
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 5,
                finalSampleSize: 80,
            },
        },
        populationSize: 200,
        deadlinePassed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.updates).toMatchObject({
        currentStage: 3,
        samplingResults: null,
        reportContent: null,
        stage3CompletedAt: null,
        stage4CompletedAt: null,
        samplePlan: {
            confidenceLevel: "95",
            marginOfError: 5,
            finalSampleSize: 80,
        },
    });
});

test("changing sample plan assumptions with the same final sample size keeps sampling but invalidates the report", () => {
    const result = buildExperimentSaveUpdates({
        experimentRecord: buildExperimentRecord(),
        body: {
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 4,
                finalSampleSize: 50,
            },
        },
        populationSize: 200,
        deadlinePassed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.updates.samplingResults).toBeUndefined();
    expect(result.updates.reportContent).toBeNull();
    expect(result.updates.stage4CompletedAt).toBeNull();
    expect(result.updates.currentStage).toBeUndefined();
});

test("saving an unchanged sample plan keeps downstream results intact", () => {
    const result = buildExperimentSaveUpdates({
        experimentRecord: buildExperimentRecord(),
        body: {
            samplePlan: {
                confidenceLevel: "95",
                marginOfError: 5,
                finalSampleSize: 50,
            },
        },
        populationSize: 200,
        deadlinePassed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.updates.samplingResults).toBeUndefined();
    expect(result.updates.reportContent).toBeUndefined();
    expect(result.updates.stage4CompletedAt).toBeUndefined();
    expect(result.updates.currentStage).toBeUndefined();
});
