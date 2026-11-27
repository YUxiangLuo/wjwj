import { expect, mock, test } from "bun:test";
import { WorkerServiceError } from "../../server/worker-service";
import { createMockDb } from "../../test-utils/mock-db";

test("C-05 createSavedAnalysis maps REPLAY_MISMATCH and INVALID_SAMPLE worker errors to 409 AnalysisConflict", async () => {
    let nextWorkerError = new WorkerServiceError("REPLAY_MISMATCH", "抽样结果无法由可信设计重演", 500);
    const now = new Date();
    const dictionary = {
        source: "src-hash",
        revision: 1,
        variables: [
            { field: "id", label: "ID", unit: "", kind: "identifier" as const, categories: [], missing: [] },
            { field: "y", label: "目标", unit: "元", kind: "continuous" as const, categories: [], missing: [] },
        ],
    };
    const contextRow = {
        record: {
            id: 11,
            studentId: 2,
            taskId: 5,
            version: 3,
            samplingGeneration: 1,
            status: "in_progress",
            currentStage: 5,
            stage5CompletedAt: null,
            activeWaveNumber: 1,
            wavesData: null,
            samplingResults: {
                simple: { completed: true, serverGenerated: true, sampleCount: 2, seed: 999, indices: [0, 1] },
            },
        },
        template: {
            id: 7,
            status: 1,
            excelFilePath: "/storage/pop.csv",
            fieldMapping: { identifier: "id", numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
            fieldworkConfig: null,
            variableDictionary: dictionary,
            variableRevision: 1,
        },
        openTime: new Date(now.getTime() - 60_000),
        deadline: new Date(now.getTime() + 3_600_000),
    };

    const { db } = createMockDb({
        select: [
            [contextRow], // ownedAnalysisContext
            [],           // existing(db)
            [contextRow], // second call: ownedAnalysisContext
            [],           // second call: existing(db)
            [contextRow], // third call: ownedAnalysisContext
            [],           // third call: existing(db)
        ],
    });
    mock.module("../../db", () => ({ db }));
    mock.module("./univariate-service", () => ({
        univariateService: {
            run: async () => {
                throw nextWorkerError;
            },
        },
    }));

    const { AnalysisConflict, createSavedAnalysis } = await import(
        `./saved-analysis-service.ts?c05=${crypto.randomUUID()}`
    ) as typeof import("./saved-analysis-service");

    const makeBody = (requestId: string) => ({
        requestId,
        observedVersion: 3,
        config: {
            question: "目标变量的总体均值估计是多少？",
            method: "simple",
            field: "y",
            weighted: false,
        },
    });

    const replayErr = await createSavedAnalysis(2, 1, 5, makeBody("req-replay-0001")).catch((e: unknown) => e);
    expect(replayErr).toBeInstanceOf(AnalysisConflict);
    expect(replayErr).toMatchObject({
        code: "REPLAY_MISMATCH",
        status: 409,
        message: "抽样结果无法由可信设计重演",
    });

    nextWorkerError = new WorkerServiceError("INVALID_SAMPLE", "样本索引或样本量无效", 500);
    const invalidSampleErr = await createSavedAnalysis(2, 1, 5, makeBody("req-sample-0002")).catch((e: unknown) => e);
    expect(invalidSampleErr).toBeInstanceOf(AnalysisConflict);
    expect(invalidSampleErr).toMatchObject({
        code: "INVALID_SAMPLE",
        status: 409,
        message: "样本索引或样本量无效",
    });

    // Unexpected infrastructure worker errors (e.g. UNIVARIATE_TIMEOUT 503) remain unmasked
    nextWorkerError = new WorkerServiceError("UNIVARIATE_TIMEOUT", "分析计算等待或计算超时，请稍后重试", 503);
    const timeoutErr = await createSavedAnalysis(2, 1, 5, makeBody("req-timeout-0003")).catch((e: unknown) => e);
    expect(timeoutErr).not.toBeInstanceOf(AnalysisConflict);
    expect(timeoutErr).toMatchObject({ code: "UNIVARIATE_TIMEOUT", status: 503 });
});
