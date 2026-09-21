import type { MethodKey } from "@/domain/experiment/types";
import { executeSamplingAction } from "./sampling-service";

type SamplingSection = Record<string, unknown>;

function sameNumbers(left: unknown, right: unknown) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
        && left.every((value, index) => typeof value === "number" && value === right[index]);
}

function sameNumber(left: unknown, right: unknown) {
    return typeof left === "number" && left === right;
}

function sameProbabilitySummary(left: unknown, right: unknown) {
    if (!left || typeof left !== "object" || Array.isArray(left)
        || !right || typeof right !== "object" || Array.isArray(right)) return false;
    const keys = ["populationCount", "probabilitySum", "minInclusionProbability", "maxInclusionProbability", "certaintyUnitCount"];
    return keys.every((key) => sameNumber((left as SamplingSection)[key], (right as SamplingSection)[key]));
}

function sameLayers(left: unknown, right: unknown) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((layer, index) => {
        const other = right[index];
        if (!layer || typeof layer !== "object" || Array.isArray(layer)
            || !other || typeof other !== "object" || Array.isArray(other)) return false;
        const leftLayer = layer as SamplingSection;
        const rightLayer = other as SamplingSection;
        return typeof leftLayer.name === "string" && leftLayer.name === rightLayer.name
            && sameNumber(leftLayer.count, rightLayer.count)
            && sameNumber(leftLayer.ratio, rightLayer.ratio)
            && sameNumber(leftLayer.sampleCount, rightLayer.sampleCount);
    });
}

/** Rebuild a compact server result from its seed and reject any changed design evidence. */
export async function replaySamplingSection(params: {
    method: MethodKey;
    section: SamplingSection;
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
}) {
    const { method, section, population, fieldMapping } = params;
    const sampleCount = section.sampleCount;
    if (section.completed !== true || section.serverGenerated !== true
        || !Number.isSafeInteger(section.seed) || !Number.isSafeInteger(sampleCount)
        || !Array.isArray(section.indices)) return { ok: false as const };

    const rawParams: Record<string, unknown> = { seed: section.seed, sampleSize: sampleCount };
    if (method === "pps") rawParams.sizeField = section.sizeField;
    if (method === "stratified") {
        rawParams.stratifyBy = section.stratifyBy;
        rawParams.layers = section.layers;
    }
    const replay = await executeSamplingAction({
        method,
        rawParams,
        targetSampleSize: sampleCount as number,
        population,
        fieldMapping,
    });
    if (!replay.ok || !sameNumbers(replay.result.indices, section.indices)) return { ok: false as const };

    if (method === "systematic" && (
        !sameNumber(replay.result.interval, section.interval)
        || !sameNumber(replay.result.randomStart, section.randomStart)
    )) return { ok: false as const };
    if (method === "pps" && (
        !sameNumbers(replay.result.inclusionProbabilities, section.inclusionProbabilities)
        || !sameNumber(replay.result.randomStart, section.randomStart)
        || !sameProbabilitySummary(replay.result.probabilitySummary, section.probabilitySummary)
    )) return { ok: false as const };
    if (method === "stratified" && !sameLayers(replay.result.layers, section.layers)) {
        return { ok: false as const };
    }
    return { ok: true as const, result: replay.result };
}

export async function verifySamplingReplay(params: {
    samplingResults: unknown;
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
}) {
    if (params.samplingResults == null) return true;
    if (typeof params.samplingResults !== "object" || Array.isArray(params.samplingResults)) return false;
    const results = params.samplingResults as Record<string, unknown>;
    for (const method of ["simple", "systematic", "pps", "stratified"] as const) {
        const section = results[method];
        if (!section || typeof section !== "object" || Array.isArray(section)) continue;
        const record = section as SamplingSection;
        if (record.unavailable === true || !Object.prototype.hasOwnProperty.call(record, "indices")) continue;
        if (!(await replaySamplingSection({ method, section: record, population: params.population, fieldMapping: params.fieldMapping })).ok) {
            return false;
        }
    }
    return true;
}
