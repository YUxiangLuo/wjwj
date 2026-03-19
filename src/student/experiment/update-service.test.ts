import { describe, expect, test } from "bun:test";
import {
    buildExperimentSaveUpdates,
    buildExperimentResetUpdates,
    normalizeExperimentResetRequest,
} from "./update-service";
import { ExperimentStatus } from "./status";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExperiment(overrides: Record<string, unknown> = {}) {
    return {
        id: 1,
        studentId: 10,
        taskId: 42,
        currentStage: 2,
        status: ExperimentStatus.IN_PROGRESS as number,
        questionnaire: JSON.stringify({
            title: "Q",
            welcomeText: "W",
            endingText: "E",
            questions: [
                { id: "q1", type: "boolean", content: "Q1?" },
                { id: "q2", type: "single", content: "Q2?", options: ["A", "B"] },
                { id: "q3", type: "scale", content: "Q3?", scaleMin: 1, scaleMax: 5 },
                { id: "q4", type: "multiple", content: "Q4?", options: ["X", "Y", "Z"], minSelect: 1, maxSelect: 2 },
                { id: "q5", type: "boolean", content: "Q5?" },
            ],
        }),
        samplePlan: JSON.stringify({
            confidenceLevel: "95",
            marginOfError: 5,
            recommendedSize: 132,
            finalSampleSize: 50,
        }),
        samplingResults: null as unknown,
        samplingDataPath: null as string | null,
        reportContent: null as string | null,
        stage1CompletedAt: new Date() as Date | null,
        stage2CompletedAt: new Date() as Date | null,
        stage3CompletedAt: null as Date | null,
        stage4CompletedAt: null as Date | null,
        lastSavedAt: null as Date | null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

const VALID_SAMPLING_RESULTS = JSON.stringify({
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
});

// ---------------------------------------------------------------------------
// Downstream invalidation — saving samplePlan clears downstream
// ---------------------------------------------------------------------------

describe("buildExperimentSaveUpdates – downstream invalidation", () => {
    test("saving samplePlan clears existing samplingResults and reportContent", () => {
        const exp = makeExperiment({
            currentStage: 4,
            samplingResults: VALID_SAMPLING_RESULTS,
            reportContent: "old report",
            stage3CompletedAt: new Date(),
            stage4CompletedAt: new Date(),
        });

        const result = buildExperimentSaveUpdates({
            experimentRecord: exp,
            body: {
                samplePlan: {
                    confidenceLevel: "95",
                    marginOfError: 3,
                    recommendedSize: 200,
                    finalSampleSize: 200,
                },
            },
            populationSize: 1000,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Downstream data should be invalidated
        expect(result.updates.samplingResults).toBeNull();
        expect(result.updates.reportContent).toBeNull();
        expect(result.updates.stage3CompletedAt).toBeNull();
        expect(result.updates.stage4CompletedAt).toBeNull();
        // currentStage should be capped to 2
        expect(result.updates.currentStage).toBe(2);
    });

    test("saving samplePlan with samplingResults in same request keeps samplingResults", () => {
        const exp = makeExperiment({
            currentStage: 3,
            samplingResults: VALID_SAMPLING_RESULTS,
            reportContent: "old report",
            stage3CompletedAt: new Date(),
            stage4CompletedAt: new Date(),
        });

        const newSamplingResults = {
            simple: { completed: true, sampleCount: 100, seed: 5, data: [{ id: 5 }] },
        };

        const result = buildExperimentSaveUpdates({
            experimentRecord: exp,
            body: {
                samplePlan: { confidenceLevel: "95", marginOfError: 3, finalSampleSize: 100 },
                samplingResults: newSamplingResults,
            },
            populationSize: 1000,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // samplingResults should be the new one (not null)
        expect(result.updates.samplingResults).toEqual(newSamplingResults);
        // reportContent should still be invalidated (not in body)
        expect(result.updates.reportContent).toBeNull();
        expect(result.updates.stage4CompletedAt).toBeNull();
    });

    test("saving samplingResults clears existing reportContent", () => {
        const exp = makeExperiment({
            currentStage: 4,
            samplingResults: VALID_SAMPLING_RESULTS,
            reportContent: "old report",
            stage3CompletedAt: new Date(),
            stage4CompletedAt: new Date(),
        });

        const newResults = {
            simple: { completed: true, sampleCount: 50, seed: 99, data: [{ id: 99 }] },
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

        const result = buildExperimentSaveUpdates({
            experimentRecord: exp,
            body: { samplingResults: newResults },
            populationSize: 1000,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.updates.reportContent).toBeNull();
        expect(result.updates.stage4CompletedAt).toBeNull();
        // currentStage should be capped to 3
        expect(result.updates.currentStage).toBe(3);
    });

    test("saving samplingResults + reportContent together keeps both", () => {
        const exp = makeExperiment({
            currentStage: 4,
            samplingResults: VALID_SAMPLING_RESULTS,
            reportContent: "old report",
        });

        const result = buildExperimentSaveUpdates({
            experimentRecord: exp,
            body: {
                samplingResults: JSON.parse(VALID_SAMPLING_RESULTS),
                reportContent: "new report",
            },
            populationSize: 1000,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.updates.reportContent).toBe("new report");
        expect(result.updates.samplingResults).toEqual(JSON.parse(VALID_SAMPLING_RESULTS));
    });

    test("no invalidation when downstream data is already null", () => {
        const exp = makeExperiment({
            currentStage: 2,
            samplingResults: null,
            reportContent: null,
        });

        const result = buildExperimentSaveUpdates({
            experimentRecord: exp,
            body: { samplePlan: { confidenceLevel: "95", marginOfError: 5, finalSampleSize: 50 } },
            populationSize: 1000,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // No clearing needed – nothing existed
        expect(result.updates.samplingResults).toBeUndefined();
        expect(result.updates.reportContent).toBeUndefined();
    });

    test("saving only currentStage does not trigger invalidation", () => {
        const exp = makeExperiment({
            currentStage: 2,
            samplingResults: VALID_SAMPLING_RESULTS,
            reportContent: "existing report",
        });

        const result = buildExperimentSaveUpdates({
            experimentRecord: exp,
            body: { currentStage: 2 },
            populationSize: 1000,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Neither samplePlan nor samplingResults in body → no downstream clearing
        expect(result.updates.samplingResults).toBeUndefined();
        expect(result.updates.reportContent).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Existing behavior tests for reset
// ---------------------------------------------------------------------------

describe("buildExperimentResetUpdates", () => {
    test("reset to stage 2 clears stages 3-4 data", () => {
        const exp = makeExperiment({
            currentStage: 4,
            samplingResults: VALID_SAMPLING_RESULTS,
            reportContent: "report",
            stage3CompletedAt: new Date(),
            stage4CompletedAt: new Date(),
        });

        const result = buildExperimentResetUpdates({
            experimentRecord: exp,
            resetToStage: 2,
            clearQuestionnaire: false,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.updates.currentStage).toBe(2);
        expect(result.updates.samplingResults).toBeNull();
        expect(result.updates.reportContent).toBeNull();
        expect(result.updates.stage3CompletedAt).toBeNull();
        expect(result.updates.stage4CompletedAt).toBeNull();
    });

    test("reset to stage 1 clears everything", () => {
        const exp = makeExperiment({
            currentStage: 4,
            samplingResults: VALID_SAMPLING_RESULTS,
            reportContent: "report",
            stage2CompletedAt: new Date(),
            stage3CompletedAt: new Date(),
            stage4CompletedAt: new Date(),
        });

        const result = buildExperimentResetUpdates({
            experimentRecord: exp,
            resetToStage: 1,
            clearQuestionnaire: true,
            deadlinePassed: false,
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        expect(result.updates.currentStage).toBe(1);
        expect(result.updates.questionnaire).toBeNull();
        expect(result.updates.samplePlan).toBeNull();
        expect(result.updates.samplingResults).toBeNull();
        expect(result.updates.reportContent).toBeNull();
    });
});

describe("normalizeExperimentResetRequest", () => {
    test("clamps resetToStage to 0-4 range", () => {
        expect(normalizeExperimentResetRequest({ resetToStage: -5 })).toEqual({ resetToStage: 0, clearQuestionnaire: false });
        expect(normalizeExperimentResetRequest({ resetToStage: 99 })).toEqual({ resetToStage: 4, clearQuestionnaire: false });
    });

    test("defaults to stage 1 for non-numeric input", () => {
        expect(normalizeExperimentResetRequest({} as { resetToStage?: number })).toEqual({ resetToStage: 1, clearQuestionnaire: false });
    });
});
