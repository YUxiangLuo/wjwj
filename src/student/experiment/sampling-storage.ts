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
        if (section.serverGenerated === true && section.completed === true) {
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
            hydrated[method] = section;
            continue;
        }

        const validated = validateReplaySection(method, section, population.length);
        if (!validated.ok) return { ok: false, method, reason: validated.reason };
        hydrated[method] = {
            ...section,
            data: validated.indices.map((index) => population[index]!),
        };
    }
    return { ok: true, value: hydrated };
}

export function samplingResultsNeedPopulation(value: unknown) {
    const inspection = inspectSamplingResultsStorage(value);
    return inspection.ok && inspection.needsPopulation;
}
