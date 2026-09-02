import type { MethodKey, SamplingResultsData } from "../api-client";
import { createSeededRandom, drawPreparedPPSSample, preparePPSSampling, stratumKey } from "../sampling";
import type { ResolvedStudyContract } from "../../lib/analysis-target";
import { resolveStudyContract } from "../../lib/analysis-target";
import { normalizeConfidenceLevel, zForConfidenceLevel } from "./confidence-level";
import {
    buildPopulationCategoricalStats,
    buildPopulationNumericStats,
    getCategoricalFieldsFromTopicMapping,
    type PopulationNumericStat,
    type TopicFieldMapping,
} from "./population-data";

const METHODS: MethodKey[] = ["simple", "systematic", "pps", "stratified"];
export const DEFAULT_PPS_MONTE_CARLO_REPLICATES = 512;

/** 教学环境可调整重复次数；设置边界避免误配置导致无意义结果或过量计算。 */
export function resolvePpsMonteCarloReplicates(rawValue?: string): number {
    if (rawValue == null || rawValue.trim() === "") return DEFAULT_PPS_MONTE_CARLO_REPLICATES;
    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed >= 32 && parsed <= 1024
        ? parsed
        : DEFAULT_PPS_MONTE_CARLO_REPLICATES;
}

interface PpsStandardErrorContext {
    standardErrors: Record<string, number | null>;
    mode: "monte_carlo" | "census_exact";
    replicateCount: number;
}

const PPS_CONTEXT_CACHE_MAX_ENTRIES_PER_POPULATION = 16;
const ppsStandardErrorContextCache = new WeakMap<
    Array<Record<string, unknown>>,
    Map<string, PpsStandardErrorContext>
>();

function ppsContextCacheKey(
    sizeField: string,
    sampleSize: number,
    fieldKeys: string[],
    replicateCount: number,
) {
    return JSON.stringify([sizeField, sampleSize, fieldKeys, replicateCount]);
}

function getCachedPpsStandardErrorContext(
    population: Array<Record<string, unknown>>,
    key: string,
) {
    const populationCache = ppsStandardErrorContextCache.get(population);
    const cached = populationCache?.get(key);
    if (!cached || !populationCache) return null;

    // Refresh insertion order so the small per-population map behaves as LRU.
    populationCache.delete(key);
    populationCache.set(key, cached);
    return cached;
}

function cachePpsStandardErrorContext(
    population: Array<Record<string, unknown>>,
    key: string,
    context: PpsStandardErrorContext,
) {
    const populationCache = ppsStandardErrorContextCache.get(population) ?? new Map<string, PpsStandardErrorContext>();
    populationCache.set(key, context);
    while (populationCache.size > PPS_CONTEXT_CACHE_MAX_ENTRIES_PER_POPULATION) {
        const oldestKey = populationCache.keys().next().value;
        if (oldestKey === undefined) break;
        populationCache.delete(oldestKey);
    }
    ppsStandardErrorContextCache.set(population, populationCache);
    return context;
}

export interface NumericMethodAnalysis {
    estimate: number | null;
    standardError: number | null;
}

export interface NumericFieldAnalysis {
    populationMean: number;
    populationVariance: number;
    methods: Record<MethodKey, NumericMethodAnalysis>;
}

export interface CategoricalFieldAnalysis {
    population: Record<string, number>;
    methods: Record<MethodKey, Record<string, number>>;
    representativeness: Record<MethodKey, number | null>;
    /** 类别数超过上限时按总体占比保留头部，其余聚合为一个类别。 */
    truncated?: boolean;
    totalCategoryCount?: number;
    aggregatedCategoryLabel?: string;
}

export interface TargetMethodAnalysis {
    estimate: number | null;
    standardError: number | null;
    /** z × 设计 SE 的教学误差半宽。 */
    marginOfError: number | null;
    sampleSize: number | null;
    /** 在同一有限总体方差下，与当前设计 SE 等价的简单随机样本量。 */
    effectiveSampleSize: number | null;
    reliability: {
        status: "ok" | "caution" | "census" | "unavailable";
        reasons: string[];
    };
}

export interface TargetAnalysis {
    contract: ResolvedStudyContract;
    confidenceLevel: "90" | "95" | "99";
    plannedMarginOfError: number | null;
    /** 目标估计量的虚拟总体真值（均值或比例）。 */
    populationValue: number;
    methods: Record<MethodKey, TargetMethodAnalysis>;
}

export interface AnalysisMetricsResult {
    ppsMonteCarloReplicates: number;
    ppsStandardErrorMode: PpsStandardErrorContext["mode"] | null;
    numericFields: string[];
    excludedNumericFields: string[];
    categoricalFields: string[];
    numeric: Record<string, NumericFieldAnalysis>;
    categorical: Record<string, CategoricalFieldAnalysis>;
    target: TargetAnalysis | null;
}

function unique<T>(values: T[]) {
    return Array.from(new Set(values));
}

function buildEmptyNumericMethodAnalysis(): Record<MethodKey, NumericMethodAnalysis> {
    return {
        simple: { estimate: null, standardError: null },
        systematic: { estimate: null, standardError: null },
        pps: { estimate: null, standardError: null },
        stratified: { estimate: null, standardError: null },
    };
}

function buildEmptyCategoricalMethodAnalysis(): Record<MethodKey, Record<string, number>> {
    return {
        simple: {},
        systematic: {},
        pps: {},
        stratified: {},
    };
}

function buildEmptyRepresentativeness(): Record<MethodKey, number | null> {
    return {
        simple: null,
        systematic: null,
        pps: null,
        stratified: null,
    };
}

function toFiniteNumber(value: unknown) {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function toTrimmedCategory(value: unknown) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
}

/** 从数据行提取数值的访问器：均值目标直接读字段，比例目标映射为 0/1 指示变量。 */
type NumericAccessor = (row: Record<string, unknown>) => number | null;

function fieldAccessor(field: string): NumericAccessor {
    return (row) => toFiniteNumber(row[field]);
}

function extractFiniteValues(rows: Array<Record<string, unknown>>, field: string) {
    return rows
        .map((row) => toFiniteNumber(row[field]))
        .filter((value): value is number => value !== null);
}

function extractAccessorValues(rows: Array<Record<string, unknown>>, accessor: NumericAccessor) {
    const values: number[] = [];
    for (const row of rows) {
        const value = accessor(row);
        if (value !== null) values.push(value);
    }
    return values;
}

function estimateSimpleValue(rows: Array<Record<string, unknown>>, accessor: NumericAccessor) {
    const values = extractAccessorValues(rows, accessor);
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function estimateSimpleMean(rows: Array<Record<string, unknown>>, field: string) {
    return estimateSimpleValue(rows, fieldAccessor(field));
}

/** Hájek 比估计：Σ (y_i/π_i) / Σ (1/π_i)，不是 (1/N) Σ (y_i/π_i) 的 HT 均值。 */
function estimateWeightedValue(
    rows: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    inclusionProbabilities: number[] | undefined,
) {
    if (!Array.isArray(inclusionProbabilities) || inclusionProbabilities.length !== rows.length) {
        return null;
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (let index = 0; index < rows.length; index += 1) {
        const value = accessor(rows[index]!);
        const inclusionProbability = Number(inclusionProbabilities[index]);
        if (value === null || !Number.isFinite(inclusionProbability) || inclusionProbability <= 0) {
            continue;
        }
        const weight = 1 / inclusionProbability;
        weightedSum += weight * value;
        totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function estimateWeightedMean(
    rows: Array<Record<string, unknown>>,
    field: string,
    inclusionProbabilities: number[] | undefined,
) {
    return estimateWeightedValue(rows, fieldAccessor(field), inclusionProbabilities);
}

function estimateSimpleDistribution(rows: Array<Record<string, unknown>>, field: string) {
    const counts: Record<string, number> = {};
    let total = 0;

    for (const row of rows) {
        const category = toTrimmedCategory(row[field]);
        if (!category) continue;
        counts[category] = (counts[category] || 0) + 1;
        total += 1;
    }

    if (total === 0) return {};

    return Object.fromEntries(
        Object.entries(counts).map(([category, count]) => [category, count / total * 100])
    );
}

function estimateWeightedDistribution(
    rows: Array<Record<string, unknown>>,
    field: string,
    inclusionProbabilities: number[] | undefined,
) {
    if (!Array.isArray(inclusionProbabilities) || inclusionProbabilities.length !== rows.length) {
        return {};
    }

    const counts: Record<string, number> = {};
    let totalWeight = 0;

    for (let index = 0; index < rows.length; index += 1) {
        const category = toTrimmedCategory(rows[index]?.[field]);
        const inclusionProbability = Number(inclusionProbabilities[index]);
        if (!category || !Number.isFinite(inclusionProbability) || inclusionProbability <= 0) {
            continue;
        }
        const weight = 1 / inclusionProbability;
        counts[category] = (counts[category] || 0) + weight;
        totalWeight += weight;
    }

    if (totalWeight <= 0) return {};

    return Object.fromEntries(
        Object.entries(counts).map(([category, weightedCount]) => [category, weightedCount / totalWeight * 100])
    );
}

function computeSimpleRandomMeanSe(
    populationStat: PopulationNumericStat | undefined,
    populationSize: number,
    sampleSize: number,
) {
    if (!populationStat || sampleSize < 1 || populationSize < 1) return null;
    if (sampleSize >= populationSize || populationSize <= 1) return 0;
    const samplingFraction = sampleSize / populationSize;
    return Math.sqrt((1 - samplingFraction) * populationStat.variance / sampleSize);
}

function computeLegacySystematicValueSe(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    kValue: number,
) {
    if (!Number.isInteger(kValue) || kValue < 1 || population.length === 0) return null;

    const startMeans: number[] = [];
    for (let startIndex = 0; startIndex < kValue; startIndex += 1) {
        const values: number[] = [];
        for (let index = startIndex; index < population.length; index += kValue) {
            const value = accessor(population[index]!);
            if (value !== null) {
                values.push(value);
            }
        }
        if (values.length === 0) continue;
        startMeans.push(values.reduce((sum, value) => sum + value, 0) / values.length);
    }

    if (startMeans.length === 0) return null;

    const meanEstimate = startMeans.reduce((sum, value) => sum + value, 0) / startMeans.length;
    const variance = startMeans.reduce((sum, value) => sum + (value - meanEstimate) ** 2, 0) / startMeans.length;
    return Math.sqrt(variance);
}

function computeFractionalSystematicValueSe(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    interval: number,
    sampleSize: number,
) {
    const populationSize = population.length;
    if (
        !Number.isFinite(interval)
        || interval < 1
        || !Number.isInteger(sampleSize)
        || sampleSize < 1
        || sampleSize > populationSize
    ) {
        return null;
    }

    const expectedInterval = populationSize / sampleSize;
    const tolerance = Number.EPSILON * Math.max(1, populationSize, interval) * 64;
    if (Math.abs(interval - expectedInterval) > tolerance) {
        return null;
    }

    // For r uniform on [0, K), a selected index changes only when
    // r + jK crosses an integer. Sweep those boundaries so the exact design
    // variance stays O(N log N), including for large uploaded populations.
    const events: Array<{ position: number; sampleIndex: number }> = [];
    for (let sampleIndex = 0; sampleIndex < sampleSize; sampleIndex += 1) {
        const offset = sampleIndex * interval;
        const upperBoundary = offset + interval;
        for (
            let integerBoundary = Math.floor(offset) + 1;
            integerBoundary < upperBoundary;
            integerBoundary += 1
        ) {
            const position = integerBoundary - offset;
            if (position > tolerance && position < interval - tolerance) {
                events.push({ position, sampleIndex });
            }
        }
    }
    events.sort((left, right) => left.position - right.position);

    const firstBoundary = events[0]?.position ?? interval;
    const initialStart = firstBoundary / 2;
    const selectedIndices = Array.from(
        { length: sampleSize },
        (_, sampleIndex) => Math.floor(initialStart + sampleIndex * interval),
    );

    let valueSum = 0;
    let valueCount = 0;
    for (const selectedIndex of selectedIndices) {
        const value = accessor(population[selectedIndex]!);
        if (value !== null) {
            valueSum += value;
            valueCount += 1;
        }
    }

    let totalWeight = 0;
    let weightedMean = 0;
    let weightedSquaredDeviation = 0;
    const includeSegment = (width: number) => {
        if (width <= tolerance || valueCount === 0) return;
        const weight = width / interval;
        const segmentMean = valueSum / valueCount;
        const nextTotalWeight = totalWeight + weight;
        const delta = segmentMean - weightedMean;
        weightedMean += delta * weight / nextTotalWeight;
        weightedSquaredDeviation += weight * delta * (segmentMean - weightedMean);
        totalWeight = nextTotalWeight;
    };

    let segmentStart = 0;
    let eventIndex = 0;
    while (eventIndex < events.length) {
        const boundary = events[eventIndex]!.position;
        includeSegment(boundary - segmentStart);

        let groupEnd = eventIndex;
        while (
            groupEnd < events.length
            && Math.abs(events[groupEnd]!.position - boundary) <= tolerance
        ) {
            const sampleIndex = events[groupEnd]!.sampleIndex;
            const previousIndex = selectedIndices[sampleIndex]!;
            const nextIndex = previousIndex + 1;
            if (nextIndex >= populationSize) return null;

            const previousValue = accessor(population[previousIndex]!);
            if (previousValue !== null) {
                valueSum -= previousValue;
                valueCount -= 1;
            }
            const nextValue = accessor(population[nextIndex]!);
            if (nextValue !== null) {
                valueSum += nextValue;
                valueCount += 1;
            }
            selectedIndices[sampleIndex] = nextIndex;
            groupEnd += 1;
        }

        segmentStart = boundary;
        eventIndex = groupEnd;
    }
    includeSegment(interval - segmentStart);

    if (totalWeight === 0) return null;
    return Math.sqrt(Math.max(0, weightedSquaredDeviation / totalWeight));
}

function computeSystematicExactMeanSe(
    population: Array<Record<string, unknown>>,
    field: string,
    design: SamplingResultsData["systematic"] | undefined,
) {
    return computeSystematicExactValueSe(population, fieldAccessor(field), design);
}

function computeSystematicExactValueSe(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    design: SamplingResultsData["systematic"] | undefined,
) {
    const interval = Number(design?.interval);
    const sampleSize = Number(design?.sampleCount);
    if (Number.isFinite(interval) && Number.isInteger(sampleSize)) {
        return computeFractionalSystematicValueSe(population, accessor, interval, sampleSize);
    }

    return computeLegacySystematicValueSe(population, accessor, Number(design?.kValue));
}

function computeStratifiedValueEstimate(
    rows: Array<Record<string, unknown>>,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
    accessor: NumericAccessor,
) {
    if (!stratifyBy || !Array.isArray(layers) || layers.length === 0 || totalPopulation < 1) {
        return null;
    }

    let estimate = 0;
    for (const layer of layers) {
        const layerRows = rows.filter((row) => stratumKey(row[stratifyBy]) === stratumKey(layer.name));
        const values = extractAccessorValues(layerRows, accessor);
        if (values.length === 0 || layer.count < 1) {
            return null;
        }
        const layerMean = values.reduce((sum, value) => sum + value, 0) / values.length;
        estimate += (layer.count / totalPopulation) * layerMean;
    }

    return estimate;
}

function computeStratifiedMeanEstimate(
    rows: Array<Record<string, unknown>>,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
    field: string,
) {
    return computeStratifiedValueEstimate(rows, stratifyBy, layers, totalPopulation, fieldAccessor(field));
}

function computeStratifiedValueSe(
    population: Array<Record<string, unknown>>,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
    accessor: NumericAccessor,
) {
    if (!stratifyBy || !Array.isArray(layers) || layers.length === 0 || totalPopulation < 1) {
        return null;
    }

    let variance = 0;

    for (const layer of layers) {
        if (layer.count < 1 || layer.sampleCount < 1) {
            return null;
        }

        const populationValues = population
            .filter((row) => stratumKey(row[stratifyBy]) === stratumKey(layer.name))
            .map((row) => accessor(row))
            .filter((value): value is number => value !== null);

        if (populationValues.length === 0) {
            return null;
        }

        const layerMean = populationValues.reduce((sum, value) => sum + value, 0) / populationValues.length;
        const layerVariance = populationValues.length > 1
            ? populationValues.reduce((sum, value) => sum + (value - layerMean) ** 2, 0) / (populationValues.length - 1)
            : 0;

        const weight = layer.count / totalPopulation;
        const finiteCorrection = Math.max(0, 1 - (layer.sampleCount / layer.count));
        variance += weight * weight * finiteCorrection * layerVariance / layer.sampleCount;
    }

    return Math.sqrt(variance);
}

function computeStratifiedMeanSe(
    population: Array<Record<string, unknown>>,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
    field: string,
) {
    return computeStratifiedValueSe(population, stratifyBy, layers, totalPopulation, fieldAccessor(field));
}

function buildPpsStandardErrorContext(
    population: Array<Record<string, unknown>>,
    sizeField: string | undefined,
    sampleSize: number | undefined,
    fields: Array<{ key: string; accessor: NumericAccessor }>,
    replicateCount: number,
): PpsStandardErrorContext | null {
    const normalizedSampleSize = Number(sampleSize);
    if (!sizeField || !Number.isInteger(normalizedSampleSize) || normalizedSampleSize < 1 || fields.length === 0) {
        return null;
    }

    const cacheKey = ppsContextCacheKey(sizeField, normalizedSampleSize, fields.map((field) => field.key), replicateCount);
    const cached = getCachedPpsStandardErrorContext(population, cacheKey);
    if (cached) return cached;

    const prepared = preparePPSSampling(population, sizeField, normalizedSampleSize);
    if (!prepared) {
        return null;
    }

    // A valid census contains every unit with inclusion probability one, so its
    // design distribution is degenerate. Repeating the identical draw hundreds
    // of times only blocks the single Bun process and cannot change the SE.
    if (normalizedSampleSize === population.length) {
        return cachePpsStandardErrorContext(population, cacheKey, {
            standardErrors: Object.fromEntries(fields.map((field) => [field.key, 0])),
            mode: "census_exact",
            replicateCount: 0,
        });
    }

    // Welford accumulators keep memory at O(number of numeric fields) instead
    // of retaining every complete PPS sample at once.
    const accumulators = Object.fromEntries(fields.map((field) => [field.key, {
        count: 0,
        mean: 0,
        squaredDeviation: 0,
    }]));

    let successfulReplicateCount = 0;
    for (let iteration = 0; iteration < replicateCount; iteration += 1) {
        const replicate = drawPreparedPPSSample(
            prepared,
            createSeededRandom(`analysis-pps-${iteration}`),
        );
        if (replicate.data.length !== normalizedSampleSize) continue;
        successfulReplicateCount += 1;

        for (const field of fields) {
            const estimate = estimateWeightedValue(
                replicate.data,
                field.accessor,
                replicate.inclusionProbabilities,
            );
            if (estimate === null) continue;

            const accumulator = accumulators[field.key]!;
            accumulator.count += 1;
            const delta = estimate - accumulator.mean;
            accumulator.mean += delta / accumulator.count;
            accumulator.squaredDeviation += delta * (estimate - accumulator.mean);
        }
    }

    const standardErrors = Object.fromEntries(fields.map((field) => {
        const accumulator = accumulators[field.key]!;
        return [
            field.key,
            accumulator.count > 1
                // 重复抽样结果用于估计设计分布的标准差，采用 Bessel 校正 R−1。
                ? Math.sqrt(Math.max(0, accumulator.squaredDeviation / (accumulator.count - 1)))
                : null,
        ];
    }));
    return cachePpsStandardErrorContext(population, cacheKey, {
        standardErrors,
        mode: "monte_carlo",
        replicateCount: successfulReplicateCount,
    });
}

function computePpsMeanSe(
    field: string,
    context: PpsStandardErrorContext | null,
) {
    return context?.standardErrors[field] ?? null;
}

function computeStratifiedDistributionEstimate(
    rows: Array<Record<string, unknown>>,
    field: string,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
) {
    if (!stratifyBy || !Array.isArray(layers) || layers.length === 0 || totalPopulation < 1) {
        return {};
    }

    const distribution: Record<string, number> = {};

    for (const layer of layers) {
        if (layer.count < 1 || layer.sampleCount < 1) {
            return {};
        }

        const layerRows = rows.filter((row) => stratumKey(row[stratifyBy]) === stratumKey(layer.name));
        if (layerRows.length === 0) {
            return {};
        }

        const layerDistribution = estimateSimpleDistribution(layerRows, field);
        const weight = layer.count / totalPopulation;
        for (const [category, proportion] of Object.entries(layerDistribution)) {
            distribution[category] = (distribution[category] || 0) + weight * proportion;
        }
    }

    return distribution;
}

function computeDistributionRepresentativeness(
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

function toPopulationPercentages(counts: Record<string, number>) {
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (total <= 0) return {};
    return Object.fromEntries(
        Object.entries(counts).map(([category, count]) => [category, count / total * 100])
    );
}

/** 分类分析类别数上限：超出后按总体占比保留头部类别，其余聚合为一项。 */
const MAX_ANALYSIS_CATEGORIES = 20;

function pickAggregatedCategoryLabel(realCategories: string[]) {
    return realCategories.includes("其他") ? "其余类别" : "其他";
}

/**
 * 类别数超限时将分布截断为头部类别 + 聚合项。
 * 头部集合由总体分布决定，所有方法的分布共用同一映射，保证横向可比；
 * 聚合标签避开真实「其他」类别，不覆盖原始数据。
 */
function truncateCategoricalDistributions(
    populationDistribution: Record<string, number>,
    methods: Record<MethodKey, Record<string, number>>,
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
    const truncate = (distribution: Record<string, number>) => {
        const truncated: Record<string, number> = {};
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

function sampleVariance(values: number[]) {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

function computeSimpleRandomValueSe(populationVariance: number, populationSize: number, sampleSize: number) {
    if (sampleSize < 1 || populationSize < 1) return null;
    if (sampleSize >= populationSize || populationSize <= 1) return 0;
    const samplingFraction = sampleSize / populationSize;
    return Math.sqrt((1 - samplingFraction) * populationVariance / sampleSize);
}

/**
 * 把设计标准误反解为同一有限总体上的等效 SRS 样本量：
 * SE² = S²(1/n - 1/N) => n = S² / (SE² + S²/N)。
 * 结果天然不超过总体规模；零设计方差或零总体方差按完整总体的信息量展示。
 */
export function computeFinitePopulationEquivalentSampleSize(
    populationVariance: number,
    populationSize: number,
    standardError: number,
) {
    if (!Number.isFinite(populationVariance) || populationVariance < 0) return null;
    if (!Number.isInteger(populationSize) || populationSize < 1) return null;
    if (!Number.isFinite(standardError) || standardError < 0) return null;
    if (standardError === 0 || populationVariance === 0) return populationSize;

    const denominator = standardError * standardError + populationVariance / populationSize;
    if (!(denominator > 0)) return null;
    return Math.min(populationSize, populationVariance / denominator);
}

function buildEmptyTargetMethodAnalysis(): Record<MethodKey, TargetMethodAnalysis> {
    return {
        simple: { estimate: null, standardError: null, marginOfError: null, sampleSize: null, effectiveSampleSize: null, reliability: { status: "unavailable", reasons: ["该方法没有可用的目标估计或设计标准误"] } },
        systematic: { estimate: null, standardError: null, marginOfError: null, sampleSize: null, effectiveSampleSize: null, reliability: { status: "unavailable", reasons: ["该方法没有可用的目标估计或设计标准误"] } },
        pps: { estimate: null, standardError: null, marginOfError: null, sampleSize: null, effectiveSampleSize: null, reliability: { status: "unavailable", reasons: ["该方法没有可用的目标估计或设计标准误"] } },
        stratified: { estimate: null, standardError: null, marginOfError: null, sampleSize: null, effectiveSampleSize: null, reliability: { status: "unavailable", reasons: ["该方法没有可用的目标估计或设计标准误"] } },
    };
}

/**
 * 研究目标聚合分析：以研究合同的目标估计量（均值或比例）为中心，
 * 给出每种抽样方法的目标估计、设计标准误、教学误差半宽、有限总体等效 SRS 样本量与可靠性提示。
 * 比例目标通过 0/1 指示变量复用全部均值机制；均值目标的 PPS 标准误直接共享数值字段上下文。
 */
function buildTargetAnalysis(params: {
    contract: ResolvedStudyContract;
    population: Array<Record<string, unknown>>;
    samplingResults: SamplingResultsData | null | undefined;
    confidenceLevel: "90" | "95" | "99";
    plannedMarginOfError: number | null;
    ppsReplicates: number;
    sharedPpsContext: PpsStandardErrorContext | null;
}): TargetAnalysis | null {
    const { contract } = params.contract;
    const { target } = contract;
    const population = params.population;
    const populationSize = population.length;
    const z = zForConfidenceLevel(params.confidenceLevel);

    const accessor: NumericAccessor = target.kind === "mean"
        ? fieldAccessor(target.field)
        : (row) => {
            const category = toTrimmedCategory(row[target.field]);
            if (category === null) return null;
            return category === target.value ? 1 : 0;
        };

    const populationValues = extractAccessorValues(population, accessor);
    if (populationValues.length === 0) return null;
    // 与数值字段的 fail-closed 约定一致：均值目标在数据不完整时不给目标分析。
    if (target.kind === "mean" && populationValues.length !== populationSize) return null;
    const populationValue = populationValues.reduce((sum, value) => sum + value, 0) / populationValues.length;
    const populationVar = sampleVariance(populationValues);

    const simpleRows = (params.samplingResults?.simple?.data ?? []) as Array<Record<string, unknown>>;
    const systematicRows = (params.samplingResults?.systematic?.data ?? []) as Array<Record<string, unknown>>;
    const ppsRows = (params.samplingResults?.pps?.data ?? []) as Array<Record<string, unknown>>;
    const stratifiedRows = (params.samplingResults?.stratified?.data ?? []) as Array<Record<string, unknown>>;
    const ppsUnavailable = Boolean(params.samplingResults?.pps?.unavailable);

    let ppsSe: number | null = null;
    if (!ppsUnavailable) {
        if (target.kind === "mean" && params.sharedPpsContext?.standardErrors[target.field] !== undefined) {
            ppsSe = params.sharedPpsContext.standardErrors[target.field] ?? null;
        } else {
            const contextKey = target.kind === "mean"
                ? `target-mean:${target.field}`
                : `target-proportion:${target.field}=${target.value}`;
            const context = buildPpsStandardErrorContext(
                population,
                params.samplingResults?.pps?.sizeField,
                params.samplingResults?.pps?.sampleCount,
                [{ key: contextKey, accessor }],
                params.ppsReplicates,
            );
            ppsSe = context?.standardErrors[contextKey] ?? null;
        }
    }

    const stratifiedDesign = params.samplingResults?.stratified;
    const methodInputs: Record<MethodKey, { estimate: number | null; standardError: number | null; sampleSize: number | null }> = {
        simple: {
            estimate: estimateSimpleValue(simpleRows, accessor),
            standardError: computeSimpleRandomValueSe(populationVar, populationSize, extractAccessorValues(simpleRows, accessor).length),
            sampleSize: extractAccessorValues(simpleRows, accessor).length || null,
        },
        systematic: {
            estimate: estimateSimpleValue(systematicRows, accessor),
            standardError: computeSystematicExactValueSe(population, accessor, params.samplingResults?.systematic),
            sampleSize: extractAccessorValues(systematicRows, accessor).length || null,
        },
        pps: {
            estimate: ppsUnavailable ? null : estimateWeightedValue(ppsRows, accessor, params.samplingResults?.pps?.inclusionProbabilities),
            standardError: ppsUnavailable ? null : ppsSe,
            sampleSize: ppsUnavailable ? null : (extractAccessorValues(ppsRows, accessor).length || null),
        },
        stratified: {
            estimate: computeStratifiedValueEstimate(stratifiedRows, stratifiedDesign?.stratifyBy, stratifiedDesign?.layers, populationSize, accessor),
            standardError: computeStratifiedValueSe(population, stratifiedDesign?.stratifyBy, stratifiedDesign?.layers, populationSize, accessor),
            sampleSize: stratifiedDesign?.layers?.reduce((sum, layer) => sum + (layer.sampleCount || 0), 0) || (extractAccessorValues(stratifiedRows, accessor).length || null),
        },
    };

    const methods = buildEmptyTargetMethodAnalysis();
    for (const method of METHODS) {
        const { estimate, standardError, sampleSize } = methodInputs[method];
        const marginOfError = standardError !== null ? z * standardError : null;
        const isCensus = sampleSize !== null && sampleSize >= populationSize;

        let effectiveSampleSize: number | null = null;
        if (isCensus) {
            effectiveSampleSize = populationSize;
        } else if (standardError !== null && sampleSize !== null) {
            effectiveSampleSize = computeFinitePopulationEquivalentSampleSize(
                populationVar,
                populationSize,
                standardError,
            );
        }

        const analysis: TargetMethodAnalysis = {
            estimate,
            standardError,
            marginOfError,
            sampleSize,
            effectiveSampleSize,
            reliability: { status: "unavailable", reasons: ["该方法没有可用的目标估计或设计标准误"] },
        };
        if (estimate !== null && standardError !== null) {
            if (isCensus) {
                analysis.reliability = { status: "census", reasons: ["当前方法覆盖完整虚拟总体"] };
            } else {
                const reasons: string[] = [];
                if (
                    effectiveSampleSize !== null
                    && effectiveSampleSize < 30
                    && effectiveSampleSize < populationSize * (1 - 1e-9)
                ) {
                    reasons.push("等效 SRS 样本量低于 30");
                }
                if (params.plannedMarginOfError !== null && marginOfError !== null
                    && marginOfError > params.plannedMarginOfError * (1 + 1e-9)) {
                    reasons.push("教学误差半宽超过规划误差限");
                }
                analysis.reliability = { status: reasons.length > 0 ? "caution" : "ok", reasons };
            }
        }
        methods[method] = analysis;
    }

    return {
        contract: params.contract,
        confidenceLevel: params.confidenceLevel,
        plannedMarginOfError: params.plannedMarginOfError,
        populationValue,
        methods,
    };
}

export function buildAnalysisMetrics(params: {
    population: Array<Record<string, unknown>>;
    fieldMapping: TopicFieldMapping | null;
    samplingResults: SamplingResultsData | null | undefined;
    /** 研究合同；缺省时由 fieldMapping 解析（含推断回退）。 */
    studyContract?: ResolvedStudyContract | null;
    /** 实验规划（置信水平与误差限）；缺省时置信水平按 95%，无规划误差限。 */
    samplePlan?: { confidenceLevel?: string; marginOfError?: number | null } | null;
    /** 推断研究合同时使用的课题名。 */
    topicName?: string | null;
}): AnalysisMetricsResult {
    const numericFields = unique(params.fieldMapping?.numeric ?? []);
    const categoricalFields = getCategoricalFieldsFromTopicMapping(params.fieldMapping);
    const populationSize = params.population.length;
    const ppsMonteCarloReplicates = resolvePpsMonteCarloReplicates(
        process.env.PPS_MONTE_CARLO_REPLICATES,
    );

    const populationNumericStats = buildPopulationNumericStats(params.population, numericFields);
    // 新映射会在服务端拒绝缺失/非数值；历史数据若不完整则整列 fail closed，避免混用总行数 N 和有效值数。
    const completeNumericFields = numericFields.filter((field) => (
        populationNumericStats[field]?.count === populationSize
    ));
    const populationCategoricalCounts = buildPopulationCategoricalStats(params.population, categoricalFields);

    const simpleRows = (params.samplingResults?.simple?.data ?? []) as Array<Record<string, unknown>>;
    const systematicRows = (params.samplingResults?.systematic?.data ?? []) as Array<Record<string, unknown>>;
    const ppsRows = (params.samplingResults?.pps?.data ?? []) as Array<Record<string, unknown>>;
    const stratifiedRows = (params.samplingResults?.stratified?.data ?? []) as Array<Record<string, unknown>>;
    const ppsStandardErrorContext = params.samplingResults?.pps?.unavailable || completeNumericFields.length === 0
        ? null
        : buildPpsStandardErrorContext(
            params.population,
            params.samplingResults?.pps?.sizeField,
            params.samplingResults?.pps?.sampleCount,
            completeNumericFields.map((field) => ({ key: field, accessor: fieldAccessor(field) })),
            ppsMonteCarloReplicates,
        );

    const numeric: Record<string, NumericFieldAnalysis> = {};
    for (const field of completeNumericFields) {
        const populationStat = populationNumericStats[field];
        if (!populationStat) continue;

        const methods = buildEmptyNumericMethodAnalysis();
        methods.simple = {
            estimate: estimateSimpleMean(simpleRows, field),
            standardError: computeSimpleRandomMeanSe(populationStat, populationSize, extractFiniteValues(simpleRows, field).length),
        };
        methods.systematic = {
            estimate: estimateSimpleMean(systematicRows, field),
            standardError: computeSystematicExactMeanSe(
                params.population,
                field,
                params.samplingResults?.systematic,
            ),
        };
        methods.pps = {
            estimate: params.samplingResults?.pps?.unavailable
                ? null
                : estimateWeightedMean(
                    ppsRows,
                    field,
                    params.samplingResults?.pps?.inclusionProbabilities,
                ),
            standardError: params.samplingResults?.pps?.unavailable
                ? null
                : computePpsMeanSe(
                    field,
                    ppsStandardErrorContext,
                ),
        };
        methods.stratified = {
            estimate: computeStratifiedMeanEstimate(
                stratifiedRows,
                params.samplingResults?.stratified?.stratifyBy,
                params.samplingResults?.stratified?.layers,
                populationSize,
                field,
            ),
            standardError: computeStratifiedMeanSe(
                params.population,
                params.samplingResults?.stratified?.stratifyBy,
                params.samplingResults?.stratified?.layers,
                populationSize,
                field,
            ),
        };

        numeric[field] = {
            populationMean: populationStat.mean,
            populationVariance: populationStat.variance,
            methods,
        };
    }

    const categorical: Record<string, CategoricalFieldAnalysis> = {};
    for (const field of categoricalFields) {
        const populationCounts = populationCategoricalCounts[field];
        if (!populationCounts) continue;

        const fullPopulationDistribution = toPopulationPercentages(populationCounts);
        const fullMethods = buildEmptyCategoricalMethodAnalysis();
        fullMethods.simple = estimateSimpleDistribution(simpleRows, field);
        fullMethods.systematic = estimateSimpleDistribution(systematicRows, field);
        fullMethods.pps = params.samplingResults?.pps?.unavailable
            ? {}
            : estimateWeightedDistribution(
                ppsRows,
                field,
                params.samplingResults?.pps?.inclusionProbabilities,
            );
        fullMethods.stratified = computeStratifiedDistributionEstimate(
            stratifiedRows,
            field,
            params.samplingResults?.stratified?.stratifyBy,
            params.samplingResults?.stratified?.layers,
            populationSize,
        );

        // 类别数超限时聚合尾部，各方法共用同一映射后再算代表性。
        const truncated = truncateCategoricalDistributions(fullPopulationDistribution, fullMethods);
        const populationDistribution = truncated?.population ?? fullPopulationDistribution;
        const methods = truncated?.methods ?? fullMethods;

        const representativeness = buildEmptyRepresentativeness();
        for (const method of METHODS) {
            if (method === "pps" && params.samplingResults?.pps?.unavailable) {
                representativeness[method] = null;
                continue;
            }
            representativeness[method] = computeDistributionRepresentativeness(
                populationDistribution,
                methods[method],
            );
        }

        categorical[field] = {
            population: populationDistribution,
            methods,
            representativeness,
            ...(truncated ? {
                truncated: true,
                totalCategoryCount: Object.keys(fullPopulationDistribution).length,
                aggregatedCategoryLabel: truncated.aggregatedCategoryLabel,
            } : {}),
        };
    }

    const resolvedContract = params.studyContract !== undefined
        ? params.studyContract
        : resolveStudyContract(params.fieldMapping, { topicName: params.topicName });
    const confidenceLevel = normalizeConfidenceLevel(String(params.samplePlan?.confidenceLevel ?? "95"));
    const rawMargin = params.samplePlan?.marginOfError;
    const plannedMarginOfError = resolvedContract && typeof rawMargin === "number" && Number.isFinite(rawMargin)
        ? resolvedContract.contract.target.kind === "proportion"
            ? (rawMargin >= 1 ? rawMargin / 100 : rawMargin)
            : rawMargin
        : null;
    const target = resolvedContract
        ? buildTargetAnalysis({
            contract: resolvedContract,
            population: params.population,
            samplingResults: params.samplingResults,
            confidenceLevel,
            plannedMarginOfError,
            ppsReplicates: ppsMonteCarloReplicates,
            sharedPpsContext: ppsStandardErrorContext,
        })
        : null;

    return {
        ppsMonteCarloReplicates: ppsStandardErrorContext?.mode === "monte_carlo"
            ? ppsStandardErrorContext.replicateCount
            : 0,
        ppsStandardErrorMode: ppsStandardErrorContext?.mode ?? null,
        numericFields: Object.keys(numeric),
        excludedNumericFields: numericFields.filter((field) => !completeNumericFields.includes(field)),
        categoricalFields: Object.keys(categorical),
        numeric,
        categorical,
        target,
    };
}
