import { parseFieldKey } from "@/lib/analysis-target";
import { stratumKey } from "@/domain/statistics/sampling";

const SAMPLING_METHODS = ["simple", "systematic", "pps", "stratified"] as const;

export type SamplingMethod = typeof SAMPLING_METHODS[number];
type SamplingSection = Record<string, unknown> & {
    data?: unknown[];
    indices?: unknown;
};
export type SamplingResults = Partial<Record<SamplingMethod, SamplingSection>>;

export const INVALID_SAMPLING_STORAGE_CODE = "INVALID_SAMPLING_STORAGE";
export const INVALID_SAMPLING_STORAGE_MESSAGE = "抽样结果存储损坏，请联系管理员";

export type SamplingStorageInspection =
    | { ok: true; needsPopulation: boolean }
    | { ok: false; method: SamplingMethod; reason: string };

export type SamplingHydrationResult =
    | { ok: true; value: SamplingResults | null }
    | { ok: false; method: SamplingMethod; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: object, key: string) {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function validateSectionMetadata(
    method: SamplingMethod,
    section: SamplingSection,
    itemCount: number,
    options: { requireSampleCount: boolean; requirePpsProbabilities: boolean },
): string | null {
    if (options.requireSampleCount && !hasOwn(section, "sampleCount")) {
        return "completed result has no sampleCount";
    }
    if (hasOwn(section, "sampleCount")) {
        const sampleCount = Number(section.sampleCount);
        if (!Number.isSafeInteger(sampleCount) || sampleCount < 0 || sampleCount !== itemCount) {
            return "sampleCount does not match sampled items";
        }
    }

    if (method === "pps" && (options.requirePpsProbabilities || hasOwn(section, "inclusionProbabilities"))) {
        const probabilities = section.inclusionProbabilities;
        if (
            !Array.isArray(probabilities)
            || probabilities.length !== itemCount
            || probabilities.some((value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1)
        ) {
            return "PPS inclusion probabilities do not match sampled items";
        }
    }

    if (method === "stratified" && options.requireSampleCount && (
        typeof section.stratifyBy !== "string" || !section.stratifyBy.trim() || !Array.isArray(section.layers)
    )) {
        return "completed stratified result has no design metadata";
    }
    if (method === "stratified" && Array.isArray(section.layers) && hasOwn(section, "sampleCount")) {
        const layerTotal = section.layers.reduce((sum, layer) => {
            if (!isRecord(layer) || !Number.isSafeInteger(Number(layer.sampleCount)) || Number(layer.sampleCount) < 0) {
                return Number.NaN;
            }
            return sum + Number(layer.sampleCount);
        }, 0);
        if (!Number.isFinite(layerTotal) || layerTotal !== Number(section.sampleCount)) {
            return "stratified layer counts do not match sampleCount";
        }
    }

    return null;
}

function validateStratifiedPopulationCoverage(
    section: SamplingSection,
    population: Array<Record<string, unknown>>,
    sampledRows: Array<Record<string, unknown>>,
) {
    const field = parseFieldKey(section.stratifyBy);
    if (!field || !Array.isArray(section.layers)) return "stratified design metadata is missing";
    const populationCounts = new Map<string, number>();
    for (const row of population) {
        const key = stratumKey(row[field]);
        if (!key) return "stratified field does not cover the population";
        populationCounts.set(key, (populationCounts.get(key) ?? 0) + 1);
    }
    const sampledCounts = new Map<string, number>();
    for (const row of sampledRows) {
        const key = stratumKey(row[field]);
        if (!key) return "sampled row has no stratum";
        sampledCounts.set(key, (sampledCounts.get(key) ?? 0) + 1);
    }
    const names = new Set<string>();
    let covered = 0;
    for (const rawLayer of section.layers) {
        if (!isRecord(rawLayer)) return "stratified layer is invalid";
        const name = stratumKey(rawLayer.name);
        const count = Number(rawLayer.count);
        const sampleCount = Number(rawLayer.sampleCount);
        if (
            !name || names.has(name)
            || !Number.isSafeInteger(count) || count < 1
            || !Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > count
            || populationCounts.get(name) !== count
            || sampledCounts.get(name) !== sampleCount
        ) return "stratified layer does not match population coverage";
        names.add(name);
        covered += count;
    }
    if (covered !== population.length || names.size !== populationCounts.size) {
        return "stratified layers do not cover the population";
    }
    return null;
}

export function compactSamplingMethodResult<T extends Record<string, unknown>>(result: T) {
    // Legacy records have embedded rows but no replay indices; keep those rows
    // so an in-progress pre-migration experiment can still be submitted safely.
    if (!Array.isArray(result.indices)) return { ...result };
    const { data: _data, ...compact } = result;
    return compact;
}

export function compactSamplingResults(value: unknown): SamplingResults | null {
    if (!isRecord(value)) return null;

    const compact: SamplingResults = {};
    for (const method of SAMPLING_METHODS) {
        const section = value[method];
        if (isRecord(section)) compact[method] = compactSamplingMethodResult(section);
    }
    return compact;
}

/** Validate the storage shape before deciding whether a population file must be read. */
export function inspectSamplingResultsStorage(value: unknown): SamplingStorageInspection {
    if (value == null) return { ok: true, needsPopulation: false };
    if (!isRecord(value)) return { ok: false, method: "simple", reason: "results are not an object" };

    let needsPopulation = false;
    for (const method of SAMPLING_METHODS) {
        const section = value[method];
        if (section === undefined) continue;
        if (!isRecord(section)) return { ok: false, method, reason: "method result is not an object" };
        if (hasOwn(section, "data") && !Array.isArray(section.data)) {
            return { ok: false, method, reason: "embedded sample data are not an array" };
        }
        if (section.unavailable === true) {
            if (method !== "pps") return { ok: false, method, reason: "only PPS can be unavailable" };
            if (hasOwn(section, "indices") || hasOwn(section, "data")) {
                return { ok: false, method, reason: "unavailable PPS result contains sampled items" };
            }
            continue;
        }
        if (hasOwn(section, "indices")) {
            if (!Array.isArray(section.indices)) return { ok: false, method, reason: "indices are not an array" };
            const completeServerResult = section.completed === true || section.serverGenerated === true;
            const metadataError = validateSectionMetadata(method, section, section.indices.length, {
                requireSampleCount: completeServerResult,
                requirePpsProbabilities: method === "pps" && completeServerResult,
            });
            if (metadataError) return { ok: false, method, reason: metadataError };
            needsPopulation = true;
            continue;
        }
        // Only rows with no replay indices are genuine legacy embedded results.
        if (Array.isArray(section.data)) {
            const metadataError = validateSectionMetadata(method, section, section.data.length, {
                requireSampleCount: false,
                requirePpsProbabilities: false,
            });
            if (metadataError) return { ok: false, method, reason: metadataError };
            continue;
        }
        // A completed method with neither replay indices nor embedded rows is
        // corrupt storage (e.g. a truncated JSONB update). Treating it as an
        // empty legacy sample would silently hide the corruption behind an
        // "unavailable" analysis instead of reporting invalid storage.
        if (section.completed === true) {
            return { ok: false, method, reason: "completed result has no sampled rows" };
        }
        if (section.serverGenerated === true) {
            return { ok: false, method, reason: "server-generated result has no replay indices" };
        }
    }
    return { ok: true, needsPopulation };
}

function validateReplaySection(
    method: SamplingMethod,
    section: SamplingSection,
    populationLength: number,
): { ok: true; indices: number[] } | { ok: false; reason: string } {
    if (!Array.isArray(section.indices)) return { ok: false, reason: "indices are not an array" };

    const indices: number[] = [];
    const unique = new Set<number>();
    for (const value of section.indices) {
        if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) >= populationLength) {
            return { ok: false, reason: "indices contain an out-of-range value" };
        }
        const index = Number(value);
        if (unique.has(index)) return { ok: false, reason: "indices contain duplicates" };
        unique.add(index);
        indices.push(index);
    }

    if (section.completed === true && indices.length === 0) {
        return { ok: false, reason: "completed result has no indices" };
    }
    const completeServerResult = section.completed === true || section.serverGenerated === true;
    const metadataError = validateSectionMetadata(method, section, indices.length, {
        requireSampleCount: completeServerResult,
        requirePpsProbabilities: method === "pps" && completeServerResult,
    });
    if (metadataError) return { ok: false, reason: metadataError };

    return { ok: true, indices };
}

export function hydrateSamplingResults(
    value: unknown,
    population: Array<Record<string, unknown>>,
): SamplingHydrationResult {
    const inspection = inspectSamplingResultsStorage(value);
    if (!inspection.ok) return inspection;
    if (value == null) return { ok: true, value: null };
    if (!isRecord(value)) return { ok: false, method: "simple", reason: "results are not an object" };

    const hydrated: SamplingResults = {};
    for (const method of SAMPLING_METHODS) {
        const section = value[method];
        if (!isRecord(section)) continue;
        if (section.unavailable === true || !hasOwn(section, "indices")) {
            if (method === "stratified" && section.completed === true && Array.isArray(section.data)) {
                const rows = section.data.filter(isRecord);
                if (rows.length !== section.data.length) return { ok: false, method, reason: "sampled rows are invalid" };
                const coverageError = validateStratifiedPopulationCoverage(section, population, rows);
                if (coverageError) return { ok: false, method, reason: coverageError };
            }
            hydrated[method] = section;
            continue;
        }

        const validated = validateReplaySection(method, section, population.length);
        if (!validated.ok) return { ok: false, method, reason: validated.reason };
        const sampledRows = validated.indices.map((index) => population[index]!);
        if (method === "stratified") {
            const coverageError = validateStratifiedPopulationCoverage(section, population, sampledRows);
            if (coverageError) return { ok: false, method, reason: coverageError };
        }
        hydrated[method] = {
            ...section,
            data: sampledRows,
        };
    }
    return { ok: true, value: hydrated };
}

export function samplingResultsNeedPopulation(value: unknown) {
    const inspection = inspectSamplingResultsStorage(value);
    return inspection.ok && inspection.needsPopulation;
}
