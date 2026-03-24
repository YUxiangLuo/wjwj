import type { LayerInfo, AllocationMethod, AllocationComparison } from "./types";

// ─── 辅助函数 ───

/** 归一化分配（确保总和为 totalSampleSize 且不超过层总体大小，使用最大余数法） */
export function normalizeAllocation(
    allocation: Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }>,
    totalSampleSize: number,
    layers: LayerInfo[],
): Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }> {
    const exactShares = allocation.map(a => totalSampleSize * a.proportion);
    const floored = exactShares.map((s, i) =>
        Math.min(Math.floor(s), layers[i]?.count ?? Math.floor(s)),
    );

    let remainder = totalSampleSize - floored.reduce((a, b) => a + b, 0);
    const indices = floored.map((_, i) => i);
    indices.sort((a, b) => (exactShares[b]! - floored[b]!) - (exactShares[a]! - floored[a]!));

    for (const idx of indices) {
        if (remainder <= 0) break;
        const maxAdd = (layers[idx]?.count ?? 0) - floored[idx]!;
        if (maxAdd > 0) {
            floored[idx]!++;
            remainder--;
        }
    }

    return allocation.map((a, i) => ({
        ...a,
        sampleSize: floored[i] ?? 0,
        proportion: totalSampleSize > 0 ? (floored[i] ?? 0) / totalSampleSize : 0,
    }));
}

/** 检测并标记超额分配 */
export function detectOverAllocation(
    allocation: Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }>,
    _layers: LayerInfo[],
) {
    let hasOverAllocation = false;
    const overAllocatedLayers: string[] = [];
    let adjustedTotalSampleSize = 0;

    const markedAllocation = allocation.map((a) => {
        const isOverAllocated = a.sampleSize > a.populationSize;
        const isFullyEnumerated = isOverAllocated;
        if (isOverAllocated) {
            hasOverAllocation = true;
            overAllocatedLayers.push(a.layerName);
            adjustedTotalSampleSize += a.populationSize;
        } else {
            adjustedTotalSampleSize += a.sampleSize;
        }
        return { ...a, isOverAllocated, isFullyEnumerated };
    });

    return { markedAllocation, hasOverAllocation, overAllocatedLayers, adjustedTotalSampleSize };
}

/** 方差计算 Var(ȳ_st) = Σ (Wₕ² × Sₕ² / nₕ) × (1 − nₕ / Nₕ) */
export function calculateVariance(
    allocation: Array<{ populationSize: number; sampleSize: number }>,
    layers: LayerInfo[],
    stdDevs?: number[],
): number {
    const totalPopulation = layers.reduce((a, l) => a + l.count, 0);
    let totalVariance = 0;
    allocation.forEach((a, i) => {
        const Nh = a.populationSize;
        const nh = a.sampleSize;
        const Wh = totalPopulation > 0 ? Nh / totalPopulation : 0;
        const Sh2 = stdDevs ? stdDevs[i]! ** 2 : (totalPopulation > 0 ? Nh / totalPopulation : 0);
        if (nh > 0) {
            totalVariance += Wh ** 2 * (Sh2 / nh) * (1 - nh / Nh);
        }
    });
    return totalVariance;
}

// ─── 辅助：构建 AllocationComparison 结果的公共逻辑 ───

function buildResult(
    method: AllocationMethod,
    name: string,
    description: string,
    rawAllocation: Array<{ layerName: string; populationSize: number; sampleSize: number; proportion: number }>,
    totalSampleSize: number,
    layers: LayerInfo[],
    stdDevs?: number[],
    costs?: number[],
): AllocationComparison {
    const allocation = normalizeAllocation(rawAllocation, totalSampleSize, layers);
    const { markedAllocation, hasOverAllocation, overAllocatedLayers, adjustedTotalSampleSize } =
        detectOverAllocation(allocation, layers);
    const totalVariance = calculateVariance(markedAllocation, layers, stdDevs);
    const totalCost = costs
        ? markedAllocation.reduce((sum, a, i) => sum + (costs[i] ?? 1) * a.sampleSize, 0)
        : undefined;

    return {
        method,
        name,
        description,
        allocation: markedAllocation,
        totalVariance,
        efficiency: 1,
        totalCost,
        hasOverAllocation,
        overAllocatedLayers,
        adjustedTotalSampleSize,
    };
}

function weightedAllocation(layers: LayerInfo[], totalSampleSize: number, weights: number[]) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    return layers.map((layer, index) => {
        const proportion = totalWeight > 0 ? (weights[index] ?? 0) / totalWeight : 0;
        return {
            layerName: layer.name,
            populationSize: layer.count,
            sampleSize: Math.round(totalSampleSize * proportion),
            proportion,
        };
    });
}

// ─── 8 种分配方法 ───

export function calculateProportionalAllocation(layers: LayerInfo[], n: number, stdDevs?: number[]): AllocationComparison {
    const totalPop = layers.reduce((a, l) => a + l.count, 0);
    const weights = layers.map(l => totalPop > 0 ? l.count / totalPop : 0);
    const raw = weightedAllocation(layers, n, weights);
    return buildResult("proportional", "按比例分配", "样本量与层总体大小成比例，是最常用且稳健的方法", raw, n, layers, stdDevs);
}

export function calculateEqualAllocation(layers: LayerInfo[], n: number, stdDevs?: number[]): AllocationComparison {
    const equalSize = Math.floor(n / layers.length);
    const remainder = n % layers.length;
    const raw = layers.map((layer, index) => ({
        layerName: layer.name,
        populationSize: layer.count,
        sampleSize: equalSize + (index < remainder ? 1 : 0),
        proportion: (equalSize + (index < remainder ? 1 : 0)) / n,
    }));
    return buildResult("equal", "等额分配", "每层分配相同样本量，适合各层方差相近的情况", raw, n, layers, stdDevs);
}

export function calculateNeymanAllocation(layers: LayerInfo[], n: number, stdDevs?: number[]): AllocationComparison {
    const weights = layers.map((l, i) => l.count * (stdDevs?.[i] ?? Math.sqrt(l.count)));
    const raw = weightedAllocation(layers, n, weights);
    const desc = stdDevs
        ? "基于实际层内标准差进行最优分配，使估计方差最小化"
        : "使用层规模近似标准差（选择目标变量可获得更准确的分配）";
    return buildResult("neyman", "奈曼分配", desc, raw, n, layers, stdDevs);
}

export function calculateSquareRootNAllocation(layers: LayerInfo[], n: number, stdDevs?: number[]): AllocationComparison {
    const weights = layers.map(l => Math.sqrt(l.count));
    const raw = weightedAllocation(layers, n, weights);
    return buildResult("sqrt", "与 √N 成比例", "各层样本量与 √Nₕ 成比例，在按比例和等额分配之间取得平衡（课件第25页）", raw, n, layers, stdDevs);
}

export function calculateSizeMeasureNAllocation(layers: LayerInfo[], n: number, layerMeans: number[], stdDevs?: number[]): AllocationComparison {
    const weights = layers.map((l, i) => l.count * (layerMeans[i] ?? 1));
    const raw = weightedAllocation(layers, n, weights);
    return buildResult("sizeMeasure", "与 Yₕ 成比例", "各层样本量与层总量 Yₕ（= Nₕ×ȳₕ）成比例，适用于估计总量时（课件第25页）", raw, n, layers, stdDevs);
}

export function calculateSqrtSizeMeasureNAllocation(layers: LayerInfo[], n: number, layerMeans: number[], stdDevs?: number[]): AllocationComparison {
    const weights = layers.map((l, i) => Math.sqrt(l.count * (layerMeans[i] ?? 1)));
    const raw = weightedAllocation(layers, n, weights);
    return buildResult("sqrtSizeMeasure", "与 √Yₕ 成比例", "各层样本量与 √Yₕ（= √(Nₕ×ȳₕ)）成比例，精度高于与 √N 成比例分配（课件第25页）", raw, n, layers, stdDevs);
}

export function calculateCostOptimalAllocation(layers: LayerInfo[], n: number, costs: number[], stdDevs?: number[]): AllocationComparison {
    const weights = layers.map((l, i) => {
        const sh = stdDevs?.[i] ?? Math.sqrt(l.count);
        return l.count * sh / Math.sqrt(Math.max(costs[i] ?? 1, 0.01));
    });
    const raw = weightedAllocation(layers, n, weights);
    const desc = stdDevs
        ? "aₕ ∝ Nₕ×Sₕ/√cₕ —— 在给定费用下使方差最小（课件第28页）"
        : "aₕ ∝ Nₕ×√Nₕ/√cₕ —— 用层规模近似标准差（选择目标变量获得更准确分配）";
    return buildResult("costOptimal", "最优分配（含费用）", desc, raw, n, layers, stdDevs, costs);
}

export function calculateEqualVarianceCostAllocation(layers: LayerInfo[], n: number, costs: number[], stdDevs?: number[]): AllocationComparison {
    const weights = layers.map((l, i) => l.count / Math.sqrt(Math.max(costs[i] ?? 1, 0.01)));
    const raw = weightedAllocation(layers, n, weights);
    return buildResult("equalVarianceCost", "等方差最优分配（含费用）", "aₕ ∝ Nₕ/√cₕ —— 假设各层方差相等，将更多样本分配到规模大、费用低的层（课件第30页）", raw, n, layers, stdDevs, costs);
}

// ─── Dispatcher：按方法名计算分配 ───

export interface ComputeAllocationOptions {
    stdDevs?: number[];
    layerMeans?: number[];
    costs?: number[];
}

/** 按方法名计算分配（inline 选择器使用） */
export function computeAllocation(
    method: AllocationMethod,
    layers: LayerInfo[],
    n: number,
    opts: ComputeAllocationOptions = {},
): AllocationComparison {
    switch (method) {
        case "proportional": return calculateProportionalAllocation(layers, n, opts.stdDevs);
        case "equal":        return calculateEqualAllocation(layers, n, opts.stdDevs);
        case "neyman":       return calculateNeymanAllocation(layers, n, opts.stdDevs);
        case "sqrt":         return calculateSquareRootNAllocation(layers, n, opts.stdDevs);
        case "sizeMeasure":  return calculateSizeMeasureNAllocation(layers, n, opts.layerMeans ?? [], opts.stdDevs);
        case "sqrtSizeMeasure": return calculateSqrtSizeMeasureNAllocation(layers, n, opts.layerMeans ?? [], opts.stdDevs);
        case "costOptimal":  return calculateCostOptimalAllocation(layers, n, opts.costs ?? [], opts.stdDevs);
        case "equalVarianceCost": return calculateEqualVarianceCostAllocation(layers, n, opts.costs ?? [], opts.stdDevs);
    }
}
