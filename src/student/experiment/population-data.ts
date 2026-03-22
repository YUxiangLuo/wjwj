import * as XLSX from "xlsx";
import { resolveStoragePath } from "../../server/storage-files";

export interface TopicFieldMapping {
    identifier?: string;
    stratified?: string[];
    numeric?: string[];
    others?: string[];
}

// LRU-TTL cache for parsed population data, keyed by filePath
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const populationCache = new Map<string, { data: Record<string, any>[]; ts: number }>();

export async function readPopulationData(filePath: string): Promise<Record<string, any>[]> {
    // Check cache first
    const cached = populationCache.get(filePath);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.data;
    }

    let fullPath: string;
    try {
        fullPath = resolveStoragePath(filePath);
    } catch {
        console.error("Invalid population data path:", filePath);
        return [];
    }

    try {
        const fileBuffer = await Bun.file(fullPath).arrayBuffer();
        const workbook = XLSX.read(new Uint8Array(fileBuffer), { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) return [];
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);

        // Store in cache
        populationCache.set(filePath, { data, ts: Date.now() });

        return data;
    } catch (error) {
        console.error("Failed to read excel:", error);
        return [];
    }
}

/** Evict a specific file from the population cache (e.g. after topic Excel re-upload). */
export function invalidatePopulationCache(filePath?: string) {
    if (filePath) {
        populationCache.delete(filePath);
    } else {
        populationCache.clear();
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
            const value = String(row[field]);
            counts[value] = (counts[value] || 0) + 1;
        }
        stats[field] = counts;
    }

    return stats;
}

export interface StratumNumericStat {
    mean: number;
    stdDev: number;
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
            const key = String(row[stratField]);
            (groups[key] ??= []).push(row);
        }

        for (const [stratValue, rows] of Object.entries(groups)) {
            const stratStats: Record<string, StratumNumericStat> = {};

            for (const numField of mapping.numeric) {
                const values = rows
                    .map((r) => Number(r[numField]))
                    .filter((v) => Number.isFinite(v));

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
