import type { MethodKey } from "../api-client";
import { stratumKey } from "../sampling";
import type { CategoricalFieldAnalysis } from "./analysis-metrics-types";

const METHODS: MethodKey[] = ["simple", "systematic", "pps", "stratified"];
const MAX_ANALYSIS_CATEGORIES = 20;

export function buildEmptyCategoricalMethodAnalysis(): Record<MethodKey, Record<string, number>> {
    return { simple: {}, systematic: {}, pps: {}, stratified: {} };
}

export function buildEmptyRepresentativeness(): Record<MethodKey, number | null> {
    return { simple: null, systematic: null, pps: null, stratified: null };
}

export function categoryValue(value: unknown) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text || null;
}

export function estimateSimpleDistribution(rows: Array<Record<string, unknown>>, field: string) {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
        const category = categoryValue(row[field]);
        if (!category) continue;
        counts[category] = (counts[category] ?? 0) + 1;
        total += 1;
    }
    return total === 0 ? {} : Object.fromEntries(
        Object.entries(counts).map(([category, count]) => [category, count / total * 100]),
    );
}

export function estimateWeightedDistribution(
    rows: Array<Record<string, unknown>>,
    field: string,
    inclusionProbabilities: number[] | undefined,
) {
    if (!Array.isArray(inclusionProbabilities) || inclusionProbabilities.length !== rows.length) return {};
    const counts: Record<string, number> = {};
    let totalWeight = 0;
    for (let index = 0; index < rows.length; index += 1) {
        const category = categoryValue(rows[index]?.[field]);
        const probability = Number(inclusionProbabilities[index]);
        if (!category || !Number.isFinite(probability) || probability <= 0) continue;
        const weight = 1 / probability;
        counts[category] = (counts[category] ?? 0) + weight;
        totalWeight += weight;
    }
    return totalWeight <= 0 ? {} : Object.fromEntries(
        Object.entries(counts).map(([category, count]) => [category, count / totalWeight * 100]),
    );
}

export function computeStratifiedDistributionEstimate(
    rows: Array<Record<string, unknown>>,
    field: string,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
) {
    if (!stratifyBy || !Array.isArray(layers) || layers.length === 0 || totalPopulation < 1) return {};
    const distribution: Record<string, number> = {};
    for (const layer of layers) {
        if (layer.count < 1 || layer.sampleCount < 1) return {};
        const layerRows = rows.filter((row) => stratumKey(row[stratifyBy]) === stratumKey(layer.name));
        if (layerRows.length === 0) return {};
        const layerDistribution = estimateSimpleDistribution(layerRows, field);
        const weight = layer.count / totalPopulation;
        for (const [category, proportion] of Object.entries(layerDistribution)) {
            distribution[category] = (distribution[category] ?? 0) + weight * proportion;
        }
    }
    return distribution;
}

export function computeDistributionRepresentativeness(
    populationDistribution: Record<string, number>,
    estimatedDistribution: Record<string, number>,
) {
    const categories = [...new Set([...Object.keys(populationDistribution), ...Object.keys(estimatedDistribution)])];
    if (categories.length === 0) return null;
    return categories.reduce((sum, category) => (
        sum + Math.abs((estimatedDistribution[category] ?? 0) - (populationDistribution[category] ?? 0))
    ), 0) / categories.length;
}

export function toPopulationPercentages(counts: Record<string, number>) {
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    return total <= 0 ? {} : Object.fromEntries(
        Object.entries(counts).map(([category, count]) => [category, count / total * 100]),
    );
}

function aggregate(distribution: Record<string, number>, kept: Set<string>, aggregateLabel: string) {
    const result: Record<string, number> = {};
    let other = 0;
    for (const [category, value] of Object.entries(distribution)) {
        if (kept.has(category)) result[category] = value;
        else other += value;
    }
    if (other > 0) result[aggregateLabel] = other;
    return result;
}

function resolveAggregateLabel(kept: Set<string>) {
    if (!kept.has("其他")) return "其他";
    const base = "其余类别";
    if (!kept.has(base)) return base;
    let suffix = 2;
    while (kept.has(`${base}（${suffix}）`)) suffix += 1;
    return `${base}（${suffix}）`;
}

export function limitCategoricalAnalysis(analysis: CategoricalFieldAnalysis, targetCategory?: string) {
    const categories = Object.keys(analysis.population);
    if (categories.length <= MAX_ANALYSIS_CATEGORIES) {
        return { ...analysis, truncated: false, totalCategoryCount: categories.length };
    }
    const kept = new Set<string>();
    if (targetCategory && categories.includes(targetCategory)) kept.add(targetCategory);
    for (const category of [...categories].sort((left, right) => analysis.population[right]! - analysis.population[left]!)) {
        if (kept.size >= MAX_ANALYSIS_CATEGORIES - 1) break;
        kept.add(category);
    }
    const aggregateLabel = resolveAggregateLabel(kept);
    return {
        population: aggregate(analysis.population, kept, aggregateLabel),
        methods: Object.fromEntries(METHODS.map((method) => [method, aggregate(analysis.methods[method], kept, aggregateLabel)])) as Record<MethodKey, Record<string, number>>,
        representativeness: analysis.representativeness,
        truncated: true,
        totalCategoryCount: categories.length,
        aggregatedCategoryLabel: aggregateLabel,
    } satisfies CategoricalFieldAnalysis;
}
