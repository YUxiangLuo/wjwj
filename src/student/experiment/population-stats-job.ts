import { readPopulationData } from "./population-data";
import {
    buildStratifiedStats, buildPopulationCategoricalStats, buildPopulationNumericStats,
    getPpsEligibleNumericFields, buildStratifiedNumericStats,
    parseTopicFieldMapping, getCategoricalFieldsFromTopicMapping,
} from "../../domain/statistics/population";
import { preparePPSSampling } from "../../domain/statistics/sampling";
import { resolveAnalysisTarget } from "../../lib/analysis-target";
import type { WorkerResult } from "../../server/worker-service";

export interface PopulationStatsJob { populationPath: string; fieldMapping: unknown; ppsSampleSize?: number }

function buildStats(population: Record<string, unknown>[], fieldMapping: unknown, ppsSampleSize?: number) {
    const numericFields = parseTopicFieldMapping(fieldMapping)?.numeric ?? [];
    const categoricalFields = getCategoricalFieldsFromTopicMapping(fieldMapping);
    const ppsEligibleFields = getPpsEligibleNumericFields(population, numericFields);
    const target = resolveAnalysisTarget(fieldMapping);
    const candidates = ppsEligibleFields.filter(field => target?.inferred || field !== target?.target.field);
    return {
        // null preserves the legacy no-size-field availability fallback. Never
        // claim that a precision failure counts as a completed required method.
        ...(ppsSampleSize === undefined ? {} : { ppsPlanFeasible: candidates.length === 0 ? null
            : candidates.some(field => preparePPSSampling(population, field, ppsSampleSize) !== null) }),
        stats: buildStratifiedStats(population, fieldMapping), numericFields, categoricalFields,
        categoricalStats: buildPopulationCategoricalStats(population, categoricalFields),
        populationNumericStats: buildPopulationNumericStats(population, numericFields),
        ppsEligibleFields,
        stratumNumericStats: buildStratifiedNumericStats(population, fieldMapping),
    };
}
export type PopulationStats = ReturnType<typeof buildStats>;

export async function runPopulationStatsJob(job: PopulationStatsJob): Promise<WorkerResult<PopulationStats>> {
    const population = await readPopulationData(job.populationPath, job.fieldMapping);
    if (!population.length) return { ok: false, code: "READ_FAILED", message: "总体数据为空或读取失败" };
    return { ok: true, data: buildStats(population, job.fieldMapping, job.ppsSampleSize) };
}
