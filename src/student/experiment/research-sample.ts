import { createSeededRandom, performPPSSampling, performSimpleSamplingWithIndices, performStratifiedSamplingWithIndices, performSystematicSampling, stratumKey } from "@/domain/statistics/sampling";
import type { ResearchMethod } from "@/domain/experiment/research-analysis";
import { DescriptiveError } from "@/domain/statistics/descriptive";
const object = (r: unknown): r is Record<string, any> => !!r && typeof r === "object" && !Array.isArray(r);
function requireValue(value: unknown): asserts value { if (!value) throw new DescriptiveError("抽样来源不符合当前索引与设计协议，不能推断旧记录或采用客户端数据"); }
const integer = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x);
const methodFields: Record<ResearchMethod, string[]> = { simple: [], systematic: ["interval", "randomStart"], pps: ["sizeField", "randomStart", "inclusionProbabilities", "probabilitySummary"], stratified: ["stratifyBy", "layers"] };
/** Replay only to verify saved design/indices. Return the exact original source rows; never resample to repair a mismatch. */
export async function restoreResearchSample(method: ResearchMethod, section: unknown, population: Record<string, unknown>[]) {
    requireValue(object(section) && Object.hasOwn(methodFields, method)); const s = section;
    const allowed = ["completed", "sampleCount", "seed", "indices", "serverGenerated", ...methodFields[method]];
    requireValue(Object.keys(s).every(k => allowed.includes(k)) && (!Object.hasOwn(s, "serverGenerated") || s.serverGenerated === true));
    requireValue(s.completed === true && s.data === undefined && s.unavailable === undefined && integer(s.sampleCount) && s.sampleCount >= 1 && s.sampleCount <= population.length && integer(s.seed));
    requireValue(Array.isArray(s.indices) && s.indices.length === s.sampleCount && s.indices.every((i: unknown) => integer(i) && i >= 0 && i < population.length) && new Set(s.indices).size === s.indices.length);
    const random = createSeededRandom(s.seed), n = s.sampleCount, N = population.length;
    let indices: number[], weights: number[];
    if (method === "simple") {
        indices = performSimpleSamplingWithIndices(population, n, random).indices;
        weights = indices.map(() => N / n);
    } else if (method === "systematic") {
        const sample = performSystematicSampling(population, n, random);
        requireValue(s.interval === sample.interval && s.randomStart === sample.randomStart);
        indices = sample.indices; weights = indices.map(() => N / n);
    } else if (method === "pps") {
        requireValue(typeof s.sizeField === "string" && population.every(row => typeof row[s.sizeField] === "number" && Number.isFinite(row[s.sizeField]) && (row[s.sizeField] as number) > 0));
        const sample = await performPPSSampling(population, s.sizeField, n, random);
        requireValue(sample.indices.length === n && s.randomStart === sample.randomStart && Array.isArray(s.inclusionProbabilities) && s.inclusionProbabilities.length === n && sample.inclusionProbabilities.every((p, i) => p === s.inclusionProbabilities[i]));
        const summary = sample.probabilitySummary;
        requireValue(summary && object(s.probabilitySummary) && Object.keys(s.probabilitySummary).length === Object.keys(summary).length && Object.entries(summary).every(([key, value]) => s.probabilitySummary[key] === value));
        indices = sample.indices; weights = sample.inclusionProbabilities.map(p => 1 / p);
    } else {
        requireValue(method === "stratified" && typeof s.stratifyBy === "string" && Array.isArray(s.layers) && s.layers.length >= 1 && s.layers.length <= 20);
        const counts = new Map<string, number>();
        for (const row of population) { requireValue(Object.hasOwn(row, s.stratifyBy)); const key = stratumKey(row[s.stratifyBy]); requireValue(key); counts.set(key, (counts.get(key) ?? 0) + 1); }
        const ratios = new Map<string, number>();
        for (const layer of s.layers) {
            requireValue(object(layer) && Object.keys(layer).length === 4 && Object.keys(layer).every(k => ["name", "count", "ratio", "sampleCount"].includes(k)) && typeof layer.ratio === "number" && Number.isFinite(layer.ratio) && typeof layer.name === "string" && !ratios.has(layer.name) && integer(layer.count) && layer.count === counts.get(layer.name) && integer(layer.sampleCount) && layer.sampleCount >= 1 && layer.sampleCount <= layer.count);
            ratios.set(layer.name, layer.count / layer.sampleCount);
        }
        requireValue(ratios.size === counts.size && [...counts.keys()].every(k => ratios.has(k)));
        indices = performStratifiedSamplingWithIndices(population, s.stratifyBy, s.layers, random).indices;
        weights = indices.map(i => ratios.get(stratumKey(population[i]![s.stratifyBy]))!);
    }
    requireValue(indices.length === n && indices.every((id, i) => id === s.indices[i]) && weights.every(w => Number.isFinite(w) && w >= 1));
    return { rows: indices.map(i => population[i]!), weights };
}
