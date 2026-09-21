import { stratumKey } from "../statistics/sampling";

export type SamplingDesign =
    | { method: "simple"; populationSize: number; sampleCount: number }
    | { method: "systematic"; populationSize: number; sampleCount: number }
    | { method: "pps"; inclusionProbabilities: number[] }
    | { method: "stratified"; stratifyBy: string; layers: Array<{ name: string; count: number; sampleCount: number }> };

/** Computes inverse inclusion-probability weights from trusted design metadata. */
export function calculateDesignWeights(
    design: SamplingDesign,
    population: Record<string, unknown>[],
    indices: number[],
): number[] {
    if (new Set(indices).size !== indices.length) throw new Error("样本索引不能重复");
    if (indices.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= population.length)) {
        throw new Error("样本索引无效");
    }
    let weights: number[];
    if (design.method === "simple" || design.method === "systematic") {
        if (design.populationSize !== population.length || design.sampleCount !== indices.length || design.sampleCount < 1) {
            throw new Error("抽样设计与总体或样本量不一致");
        }
        weights = indices.map(() => design.populationSize / design.sampleCount);
    } else if (design.method === "pps") {
        if (design.inclusionProbabilities.length !== indices.length) throw new Error("PPS 入样概率与样本不一致");
        // π 是入样概率，必入单元为 1；π>1 只可能来自伪造或损坏的设计元数据。
        if (design.inclusionProbabilities.some((probability) => !Number.isFinite(probability) || probability <= 0 || probability > 1)) {
            throw new Error("PPS 入样概率必须为 (0,1] 内的有限正数");
        }
        const minimumProbability = design.inclusionProbabilities.reduce(
            (minimum, probability) => Math.min(minimum, probability),
            Infinity,
        );
        // Ratio estimates are unchanged by a common positive weight factor.
        // Retain literal 1/π for ordinary inputs; normalize by min(π) only when
        // an otherwise valid reciprocal would overflow to Infinity.
        const scale = Number.isFinite(1 / minimumProbability) ? 1 : minimumProbability;
        weights = design.inclusionProbabilities.map((probability) => scale / probability);
    } else {
        const layerMap = new Map<string, { count: number; sampleCount: number }>();
        for (const layer of design.layers) {
            const key = stratumKey(layer.name);
            if (!key || layerMap.has(key) || !Number.isSafeInteger(layer.count) || layer.count < 1
                || !Number.isSafeInteger(layer.sampleCount) || layer.sampleCount < 1 || layer.sampleCount > layer.count) {
                throw new Error("分层设计无效");
            }
            layerMap.set(key, layer);
        }
        const populationCounts = new Map<string, number>();
        for (const row of population) {
            const key = stratumKey(row[design.stratifyBy]);
            if (!key) throw new Error("分层设计未覆盖完整总体");
            populationCounts.set(key, (populationCounts.get(key) ?? 0) + 1);
        }
        if (populationCounts.size !== layerMap.size
            || [...populationCounts].some(([key, count]) => layerMap.get(key)?.count !== count)) {
            throw new Error("分层设计未覆盖完整总体或与总体层容量不一致");
        }
        const sampleCounts = new Map<string, number>();
        for (const index of indices) {
            const key = stratumKey(population[index]![design.stratifyBy]);
            sampleCounts.set(key, (sampleCounts.get(key) ?? 0) + 1);
        }
        if ([...layerMap].some(([key, layer]) => sampleCounts.get(key) !== layer.sampleCount)) {
            throw new Error("分层设计与各层样本量不一致");
        }
        weights = indices.map((index) => {
            const layer = layerMap.get(stratumKey(population[index]?.[design.stratifyBy]));
            if (!layer) throw new Error("样本单位缺少分层设计");
            return layer.count / layer.sampleCount;
        });
    }
    if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) throw new Error("设计权重必须为有限正数");
    return weights;
}
