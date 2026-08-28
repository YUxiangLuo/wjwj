import type { AnalysisTarget } from "../../lib/analysis-target";
import { parseSpreadsheetFile } from "../../lib/spreadsheet";
import { resolveStoragePath } from "../../server/storage-files";
import { stratumKey } from "../sampling";

export interface TopicFieldMapping {
    identifier?: string;
    stratified?: string[];
    numeric?: string[];
    others?: string[];
    analysisTarget?: AnalysisTarget;
}

const POPULATION_CACHE_MAX_ENTRIES = 2;
const POPULATION_CACHE_MAX_ROWS = 20_000;

type PopulationCacheEntry = {
    key: string;
    rows: Record<string, any>[];
};

const populationCache: PopulationCacheEntry[] = [];

export async function readPopulationData(filePath: string): Promise<Record<string, any>[]> {
    let fullPath: string;
    try {
        fullPath = resolveStoragePath(filePath);
    } catch {
        console.error("Invalid population data path:", filePath);
        return [];
    }

    try {
        const file = Bun.file(fullPath);
        const cacheKey = `${fullPath}:${file.size}:${file.lastModified}`;
        const cached = populationCache.find((entry) => entry.key === cacheKey);
        if (cached) return cached.rows;

        const fileBuffer = await file.arrayBuffer();
        const parsed = await parseSpreadsheetFile(fileBuffer, filePath);
        if (parsed.rows.length <= POPULATION_CACHE_MAX_ROWS) {
            populationCache.unshift({ key: cacheKey, rows: parsed.rows });
            populationCache.splice(POPULATION_CACHE_MAX_ENTRIES);
        }
        return parsed.rows;
    } catch (error) {
        console.error("Failed to read population data:", error);
        return [];
    }
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

    const stats: Record<string, Record<string, number>> = {};
    for (const field of mapping.stratified) {
        const counts: Record<string, number> = {};
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
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
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

    const result: Record<string, Record<string, Record<string, StratumNumericStat>>> = {};

    for (const stratField of mapping.stratified) {
        const fieldResult: Record<string, Record<string, StratumNumericStat>> = {};

        // Group population rows by stratum value
        const groups: Record<string, Record<string, unknown>[]> = {};
        for (const row of population) {
            const key = stratumKey(row[stratField]);
            if (!key) continue;
            (groups[key] ??= []).push(row);
        }

        for (const [stratValue, rows] of Object.entries(groups)) {
            const stratStats: Record<string, StratumNumericStat> = {};

            for (const numField of mapping.numeric) {
                const values = rows
                    .map((row) => toFiniteNumericValue(row[numField]))
                    .filter((value): value is number => value !== null);

                if (values.length < 2) continue;

                const mean = values.reduce((a, b) => a + b, 0) / values.length;
                const variance =
                    values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1);

                stratStats[numField] = { mean, stdDev: Math.sqrt(variance) };
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
    const stats: Record<string, PopulationNumericStat> = {};

    for (const field of numericFields) {
        const values = population
            .map((row) => toFiniteNumericValue(row[field]))
            .filter((value): value is number => value !== null);

        if (values.length === 0) {
            continue;
        }

        const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
        const variance = values.length > 1
            ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
            : 0;

        stats[field] = {
            mean,
            variance,
            stdDev: Math.sqrt(variance),
            count: values.length,
        };
    }

    return stats;
}

export function buildPopulationCategoricalStats(
    population: Array<Record<string, unknown>>,
    categoricalFields: string[],
): Record<string, Record<string, number>> {
    const stats: Record<string, Record<string, number>> = {};

    for (const field of categoricalFields) {
        const counts: Record<string, number> = {};
        for (const row of population) {
            const raw = row[field];
            if (raw === undefined || raw === null) continue;
            const value = String(raw).trim();
            if (!value) continue;
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
            const value = Number(row[field]);
            return Number.isFinite(value) && value > 0;
        })
    );
}
