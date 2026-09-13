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
    let weights: number[];
    if (design.method === "simple" || design.method === "systematic") {
        if (design.populationSize !== population.length || design.sampleCount !== indices.length || design.sampleCount < 1) {
            throw new Error("抽样设计与总体或样本量不一致");
        }
        weights = indices.map(() => design.populationSize / design.sampleCount);
    } else if (design.method === "pps") {
        if (design.inclusionProbabilities.length !== indices.length) throw new Error("PPS 入样概率与样本不一致");
        weights = design.inclusionProbabilities.map((probability) => 1 / probability);
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
        const populationLayers = new Set(population.map((row) => stratumKey(row[design.stratifyBy])));
        if (populationLayers.has("") || populationLayers.size !== layerMap.size
            || [...populationLayers].some((key) => !layerMap.has(key))) throw new Error("分层设计未覆盖完整总体");
        weights = indices.map((index) => {
            const layer = layerMap.get(stratumKey(population[index]?.[design.stratifyBy]));
            if (!layer) throw new Error("样本单位缺少分层设计");
            return layer.count / layer.sampleCount;
        });
    }
    if (weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) throw new Error("设计权重必须为有限正数");
    return weights;
}
