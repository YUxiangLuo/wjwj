import type { AnalysisTarget, StudyContract } from "../../lib/analysis-target";
import { parseNumericText } from "../../lib/numeric-text";
import { createSafeRecord } from "../../lib/safe-record";
import { stratumKey } from "./sampling";
import { sampleVariance, scaledMean } from "./values";

export interface TopicFieldMapping {
    identifier?: string;
    stratified?: string[];
    numeric?: string[];
    others?: string[];
    analysisTarget?: AnalysisTarget;
    studyContract?: StudyContract;
}

export function parseTopicFieldMapping(fieldMapping: unknown): TopicFieldMapping | null {
    let parsed = fieldMapping;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch (error) {
            console.error("Failed to parse fieldMapping:", error);
            return null;
        }
    }

    if (!parsed || typeof parsed !== "object") {
        return null;
    }

    return parsed as TopicFieldMapping;
}

export function buildStratifiedStats(population: Array<Record<string, unknown>>, fieldMapping: unknown) {
    const mapping = parseTopicFieldMapping(fieldMapping);
    if (!mapping?.stratified?.length) {
        return {};
    }

    const stats = createSafeRecord<Record<string, number>>();
    for (const field of mapping.stratified) {
        const counts = createSafeRecord<number>();
        for (const row of population) {
            const value = stratumKey(row[field]);
            if (!value) continue;
            counts[value] = (counts[value] || 0) + 1;
        }
        stats[field] = counts;
    }

    return stats;
}

function toFiniteNumericValue(value: unknown): number | null {
    // Shared with the teacher-side validation so a column cannot pass validation
    // and still be treated as missing here.
    return parseNumericText(value);
}

export interface StratumNumericStat {
    mean: number;
    stdDev: number;
}

export interface PopulationNumericStat {
    mean: number;
    variance: number;
    stdDev: number;
    count: number;
}

/**
 * Compute within-stratum standard deviations for each numeric field,
 * grouped by each stratification field. This enables proper Neyman allocation.
 */
export function buildStratifiedNumericStats(
    population: Array<Record<string, unknown>>,
    fieldMapping: unknown,
): Record<string, Record<string, Record<string, StratumNumericStat>>> {
    const mapping = parseTopicFieldMapping(fieldMapping);
    if (!mapping?.stratified?.length || !mapping?.numeric?.length) return {};

    const result = createSafeRecord<Record<string, Record<string, StratumNumericStat>>>();

    for (const stratField of mapping.stratified) {
        const fieldResult = createSafeRecord<Record<string, StratumNumericStat>>();

        // Group population rows by stratum value
        const groups = createSafeRecord<Record<string, unknown>[]>();
        for (const row of population) {
            const key = stratumKey(row[stratField]);
            if (!key) continue;
            (groups[key] ??= []).push(row);
        }

        for (const [stratValue, rows] of Object.entries(groups)) {
            const stratStats = createSafeRecord<StratumNumericStat>();

            for (const numField of mapping.numeric) {
                const values = rows
                    .map((row) => toFiniteNumericValue(row[numField]))
                    .filter((value): value is number => value !== null);

                if (values.length === 0 || values.length !== rows.length) continue;

                const mean = scaledMean(values)!;
                const variance = sampleVariance(values);
                const stdDev = Math.sqrt(variance);
                if (![mean, variance, stdDev].every(Number.isFinite)) continue;

                stratStats[numField] = { mean, stdDev };
            }

            fieldResult[stratValue] = stratStats;
        }

        result[stratField] = fieldResult;
    }

    return result;
}

export function buildPopulationNumericStats(
    population: Array<Record<string, unknown>>,
    numericFields: string[],
): Record<string, PopulationNumericStat> {
    const stats = createSafeRecord<PopulationNumericStat>();

    for (const field of numericFields) {
        const values = population
            .map((row) => toFiniteNumericValue(row[field]))
            .filter((value): value is number => value !== null);

        if (values.length === 0) {
            continue;
        }

        const mean = scaledMean(values)!;
        const variance = sampleVariance(values);
        const stdDev = Math.sqrt(variance);
        if (![mean, variance, stdDev].every(Number.isFinite)) continue;

        stats[field] = {
            mean,
            variance,
            stdDev,
            count: values.length,
        };
    }

    return stats;
}

export function buildPopulationCategoricalStats(
    population: Array<Record<string, unknown>>,
    categoricalFields: string[],
): Record<string, Record<string, number>> {
    const stats = createSafeRecord<Record<string, number>>();

    for (const field of categoricalFields) {
        const counts = createSafeRecord<number>();
        for (const row of population) {
            const raw = row[field];
            const value = raw === undefined || raw === null || String(raw).trim() === ""
                ? "（缺失值）"
                : String(raw).trim().normalize("NFKC");
            counts[value] = (counts[value] || 0) + 1;
        }

        if (Object.keys(counts).length > 0) {
            stats[field] = counts;
        }
    }

    return stats;
}

export function getCategoricalFieldsFromTopicMapping(fieldMapping: unknown) {
    const mapping = parseTopicFieldMapping(fieldMapping);
    if (!mapping) return [];

    return Array.from(
        new Set([...(mapping.stratified ?? []), ...(mapping.others ?? [])].filter(Boolean))
    );
}

export function getPpsEligibleNumericFields(
    population: Array<Record<string, unknown>>,
    numericFields: string[],
) {
    return numericFields.filter((field) =>
        population.length > 0
        && population.every((row) => {
            const value = parseNumericText(row[field]);
            return value !== null && value > 0;
        })
    );
}
