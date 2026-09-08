import { readPopulationData } from "./population-data";
import {
    buildStratifiedStats, buildPopulationCategoricalStats, buildPopulationNumericStats,
    getPpsEligibleNumericFields, buildStratifiedNumericStats,
    parseTopicFieldMapping, getCategoricalFieldsFromTopicMapping,
} from "../../domain/statistics/population";
import type { WorkerResult } from "../../server/worker-service";

export interface PopulationStatsJob { populationPath: string; fieldMapping: unknown }

function buildStats(population: Record<string, unknown>[], fieldMapping: unknown) {
    const numericFields = parseTopicFieldMapping(fieldMapping)?.numeric ?? [];
    const categoricalFields = getCategoricalFieldsFromTopicMapping(fieldMapping);
    return {
        stats: buildStratifiedStats(population, fieldMapping), numericFields, categoricalFields,
        categoricalStats: buildPopulationCategoricalStats(population, categoricalFields),
        populationNumericStats: buildPopulationNumericStats(population, numericFields),
        ppsEligibleFields: getPpsEligibleNumericFields(population, numericFields),
        stratumNumericStats: buildStratifiedNumericStats(population, fieldMapping),
    };
}
export type PopulationStats = ReturnType<typeof buildStats>;

export async function runPopulationStatsJob(job: PopulationStatsJob): Promise<WorkerResult<PopulationStats>> {
    const population = await readPopulationData(job.populationPath, job.fieldMapping);
    if (!population.length) return { ok: false, code: "READ_FAILED", message: "总体数据为空或读取失败" };
    return { ok: true, data: buildStats(population, job.fieldMapping) };
}
