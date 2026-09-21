import { buildAnalysisMetrics } from "@/domain/statistics/analysis";
import type { AnalysisMetricsResult } from "@/domain/experiment/analysis-types";
import { readPopulationData } from "./population-data";
import { parseTopicFieldMapping } from "@/domain/statistics/population";
import { normalizeSamplePlanData } from "./sample-plan-display";
import { hydrateSamplingResults, INVALID_SAMPLING_STORAGE_MESSAGE } from "./sampling-storage";
import { parseStoredJson } from "./serialization";

/** Only file metadata and stored sample indices cross the thread boundary. */
export interface AnalysisJob {
    populationPath: string;
    fieldMapping: unknown;
    samplingResults: unknown;
    samplePlan: unknown;
    topicName?: string | null;
    targetUnit?: string | null;
}

export type AnalysisResult =
    | { ok: true; data: AnalysisMetricsResult }
    | { ok: false; code: "READ_FAILED" | "INVALID_SAMPLING_STORAGE" | "ANALYSIS_FAILED"; message: string };

export interface AnalysisWorkerRequest { id: number; job: AnalysisJob }
export interface AnalysisWorkerReply { id: number; result: AnalysisResult }

export async function runAnalysisJob(job: AnalysisJob): Promise<AnalysisResult> {
    const population = await readPopulationData(job.populationPath, job.fieldMapping);
    if (!population.length) return { ok: false, code: "READ_FAILED", message: "总体数据为空或读取失败" };
    const hydrated = hydrateSamplingResults(parseStoredJson(job.samplingResults), population);
    if (!hydrated.ok) return { ok: false, code: "INVALID_SAMPLING_STORAGE", message: INVALID_SAMPLING_STORAGE_MESSAGE };
    return {
        ok: true,
        data: buildAnalysisMetrics({
            population,
            fieldMapping: parseTopicFieldMapping(job.fieldMapping),
            samplingResults: hydrated.value as Parameters<typeof buildAnalysisMetrics>[0]["samplingResults"],
            samplePlan: normalizeSamplePlanData(parseStoredJson(job.samplePlan), population.length),
            topicName: job.topicName,
            targetUnit: job.targetUnit,
        }),
    };
}
