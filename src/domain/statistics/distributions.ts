import { unique, toTrimmedCategory } from "./values";
import type { MethodKey } from "../experiment/types";
import { SAMPLING_METHODS as METHODS } from "../../lib/sampling-policy";
import { createSafeRecord } from "../../lib/safe-record";

export function estimateSimpleDistribution(rows: Array<Record<string, unknown>>, field: string) {
    const counts = createSafeRecord<number>();
    let total = 0;

    for (const row of rows) {
        const category = toTrimmedCategory(row[field]) ?? "（缺失值）";
        counts[category] = (counts[category] || 0) + 1;
        total += 1;
    }

    if (total === 0) return {};

    return Object.fromEntries(
        Object.entries(counts).map(([category, count]) => [category, count / total * 100])
    );
}

export function computeDistributionRepresentativeness(
    populationDistribution: Record<string, number>,
    estimatedDistribution: Record<string, number>,
) {
    const categories = unique([
        ...Object.keys(populationDistribution),
        ...Object.keys(estimatedDistribution),
    ]);

    if (categories.length === 0) {
        return null;
    }

    let totalDifference = 0;
    for (const category of categories) {
        const populationValue = populationDistribution[category] ?? 0;
        const estimateValue = estimatedDistribution[category] ?? 0;
        totalDifference += Math.abs(estimateValue - populationValue);
    }

    return totalDifference / categories.length;
}

export function toPopulationPercentages(counts: Record<string, number>) {
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (total <= 0) return {};
    return Object.fromEntries(
        Object.entries(counts).map(([category, count]) => [category, count / total * 100])
    );
}

/** 分类分析类别数上限：超出后按总体占比保留头部类别，其余聚合为一项。 */
const MAX_ANALYSIS_CATEGORIES = 20;

function pickAggregatedCategoryLabel(realCategories: string[]) {
    const occupied = new Set(realCategories);
    if (!occupied.has("其他")) return "其他";
    if (!occupied.has("其余类别")) return "其余类别";
    let suffix = 2;
    while (occupied.has(`其余类别${suffix}`)) suffix += 1;
    return `其余类别${suffix}`;
}

/**
 * 类别数超限时将分布截断为头部类别 + 聚合项。
 * 头部集合由总体分布决定，所有方法的分布共用同一映射，保证横向可比；
 * 聚合标签避开真实「其他」类别，不覆盖原始数据。
 */
export function truncateCategoricalDistributions(
    populationDistribution: Record<string, number>,
    methods: Record<MethodKey, Record<string, number>>,
    preserveCategories: string[] = [],
): {
    population: Record<string, number>;
    methods: Record<MethodKey, Record<string, number>>;
    aggregatedCategoryLabel: string;
} | null {
    const categories = Object.keys(populationDistribution);
    if (categories.length <= MAX_ANALYSIS_CATEGORIES) return null;

    const aggregatedCategoryLabel = pickAggregatedCategoryLabel(categories);
    const topCategories = new Set(
        categories
            .sort((left, right) => (populationDistribution[right] ?? 0) - (populationDistribution[left] ?? 0))
            .slice(0, MAX_ANALYSIS_CATEGORIES - 1),
    );
    for (const category of preserveCategories) {
        if (!categories.includes(category) || topCategories.has(category)) continue;
        const replaceable = [...topCategories].reverse().find(value => !preserveCategories.includes(value));
        if (replaceable) {
            topCategories.delete(replaceable);
            topCategories.add(category);
        }
    }
    const truncate = (distribution: Record<string, number>) => {
        const truncated = createSafeRecord<number>();
        for (const [category, value] of Object.entries(distribution)) {
            const bucket = topCategories.has(category) ? category : aggregatedCategoryLabel;
            truncated[bucket] = (truncated[bucket] ?? 0) + value;
        }
        return truncated;
    };

    return {
        population: truncate(populationDistribution),
        methods: Object.fromEntries(
            METHODS.map((method) => [method, truncate(methods[method] ?? {})]),
        ) as Record<MethodKey, Record<string, number>>,
        aggregatedCategoryLabel,
    };
}
