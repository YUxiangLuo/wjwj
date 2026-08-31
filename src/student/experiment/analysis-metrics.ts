import type { MethodKey, SamplingResultsData } from "../api-client";
import { resolveStudyContract, type ResolvedStudyContract } from "../../lib/analysis-target";
import { createSeededRandom, drawPreparedPPSSample, preparePPSSampling, stratumKey } from "../sampling";
import { zForConfidenceLevel } from "./confidence-level";
import type {
    AnalysisMetricsResult,
    CategoricalFieldAnalysis,
    NumericFieldAnalysis,
    NumericMethodAnalysis,
    TargetAnalysis,
    TargetMethodAnalysis,
} from "./analysis-metrics-types";
import {
    buildEmptyCategoricalMethodAnalysis,
    buildEmptyRepresentativeness,
    categoryValue,
    computeDistributionRepresentativeness,
    computeStratifiedDistributionEstimate,
    estimateSimpleDistribution,
    estimateWeightedDistribution,
    limitCategoricalAnalysis,
    toPopulationPercentages,
} from "./analysis-categorical";
export type {
    AnalysisMetricsResult,
    CategoricalFieldAnalysis,
    NumericFieldAnalysis,
    NumericMethodAnalysis,
    TargetAnalysis,
    TargetMethodAnalysis,
} from "./analysis-metrics-types";
import {
    buildPopulationCategoricalStats,
    buildPopulationNumericStats,
    getCategoricalFieldsFromTopicMapping,
    type PopulationNumericStat,
    type TopicFieldMapping,
} from "./population-data";

const METHODS: MethodKey[] = ["simple", "systematic", "pps", "stratified"];
const TARGET_METRIC_KEY = "__study_target__";
export const DEFAULT_PPS_MONTE_CARLO_REPLICATES = 512;

/** 教学环境可调整重复次数；设置边界避免误配置导致无意义结果或过量计算。 */
export function resolvePpsMonteCarloReplicates(rawValue?: string): number {
    if (rawValue == null || rawValue.trim() === "") return DEFAULT_PPS_MONTE_CARLO_REPLICATES;
    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed >= 32 && parsed <= 1024
        ? parsed
        : DEFAULT_PPS_MONTE_CARLO_REPLICATES;
}

interface PpsMonteCarloContext {
    standardErrors: Record<string, number | null>;
}

const ppsContextCache = new WeakMap<Array<Record<string, unknown>>, Map<string, PpsMonteCarloContext | null>>();
const PPS_CONTEXT_CACHE_MAX_ENTRIES = 64;

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

function toFiniteNumber(value: unknown) {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

type NumericAccessor = (row: Record<string, unknown>) => number | null;

function fieldAccessor(field: string): NumericAccessor {
    return (row) => toFiniteNumber(row[field]);
}

function estimateSimpleValue(rows: Array<Record<string, unknown>>, accessor: NumericAccessor) {
    const values = rows.map(accessor).filter((value): value is number => value !== null);
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function estimateWeightedValue(
    rows: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    inclusionProbabilities: number[] | undefined,
) {
    if (!Array.isArray(inclusionProbabilities) || inclusionProbabilities.length !== rows.length) return null;
    let weightedSum = 0;
    let totalWeight = 0;
    for (let index = 0; index < rows.length; index += 1) {
        const value = rows[index] ? accessor(rows[index]!) : null;
        const inclusionProbability = Number(inclusionProbabilities[index]);
        if (value === null || !Number.isFinite(inclusionProbability) || inclusionProbability <= 0) continue;
        const weight = 1 / inclusionProbability;
        weightedSum += weight * value;
        totalWeight += weight;
    }
    return totalWeight > 0 ? weightedSum / totalWeight : null;
}

function extractFiniteValues(rows: Array<Record<string, unknown>>, field: string) {
    return rows
        .map((row) => toFiniteNumber(row[field]))
        .filter((value): value is number => value !== null);
}

function estimateSimpleMean(rows: Array<Record<string, unknown>>, field: string) {
    return estimateSimpleValue(rows, fieldAccessor(field));
}

/** Hájek 比估计：Σ (y_i/π_i) / Σ (1/π_i)，不是 (1/N) Σ (y_i/π_i) 的 HT 均值。 */
function estimateWeightedMean(
    rows: Array<Record<string, unknown>>,
    field: string,
    inclusionProbabilities: number[] | undefined,
) {
    return estimateWeightedValue(rows, fieldAccessor(field), inclusionProbabilities);
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

function computeLegacySystematicMeanSe(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    kValue: number,
) {
    if (!Number.isInteger(kValue) || kValue < 1 || population.length === 0) return null;

    const startMeans: number[] = [];
    for (let startIndex = 0; startIndex < kValue; startIndex += 1) {
        const values: number[] = [];
        for (let index = startIndex; index < population.length; index += kValue) {
            const row = population[index];
            const value = row ? accessor(row) : null;
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

function computeFractionalSystematicMeanSe(
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
        const row = population[selectedIndex];
        const value = row ? accessor(row) : null;
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

            const previousRow = population[previousIndex];
            const previousValue = previousRow ? accessor(previousRow) : null;
            if (previousValue !== null) {
                valueSum -= previousValue;
                valueCount -= 1;
            }
            const nextRow = population[nextIndex];
            const nextValue = nextRow ? accessor(nextRow) : null;
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
    accessor: NumericAccessor,
    design: SamplingResultsData["systematic"] | undefined,
) {
    const interval = Number(design?.interval);
    const sampleSize = Number(design?.sampleCount);
    if (Number.isFinite(interval) && Number.isInteger(sampleSize)) {
        return computeFractionalSystematicMeanSe(population, accessor, interval, sampleSize);
    }

    return computeLegacySystematicMeanSe(population, accessor, Number(design?.kValue));
}

function computeStratifiedMeanEstimate(
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
        const values = layerRows.map(accessor).filter((value): value is number => value !== null);
        if (values.length === 0 || layer.count < 1) {
            return null;
        }
        const layerMean = values.reduce((sum, value) => sum + value, 0) / values.length;
        estimate += (layer.count / totalPopulation) * layerMean;
    }

    return estimate;
}

function computeStratifiedMeanSe(
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
            .map(accessor)
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

function buildPpsMonteCarloContext(
    population: Array<Record<string, unknown>>,
    sizeField: string | undefined,
    sampleSize: number | undefined,
    accessors: Record<string, NumericAccessor>,
    replicateCount: number,
): PpsMonteCarloContext | null {
    const normalizedSampleSize = Number(sampleSize);
    if (!sizeField || !Number.isInteger(normalizedSampleSize) || normalizedSampleSize < 1) {
        return null;
    }
    if (normalizedSampleSize >= population.length && population.length > 0) {
        return { standardErrors: Object.fromEntries(Object.keys(accessors).map((key) => [key, 0])) };
    }

    const prepared = preparePPSSampling(population, sizeField, normalizedSampleSize);
    if (!prepared) {
        return null;
    }

    // Welford accumulators keep memory at O(number of numeric fields) instead
    // of retaining every complete PPS sample at once.
    const entries = Object.entries(accessors);
    const accumulators = Object.fromEntries(entries.map(([key]) => [key, {
        count: 0,
        mean: 0,
        squaredDeviation: 0,
    }]));

    for (let iteration = 0; iteration < replicateCount; iteration += 1) {
        const replicate = drawPreparedPPSSample(
            prepared,
            createSeededRandom(`analysis-pps-${iteration}`),
        );
        if (replicate.data.length !== normalizedSampleSize) continue;

        for (const [key, accessor] of entries) {
            const estimate = estimateWeightedValue(
                replicate.data,
                accessor,
                replicate.inclusionProbabilities,
            );
            if (estimate === null) continue;

            const accumulator = accumulators[key]!;
            accumulator.count += 1;
            const delta = estimate - accumulator.mean;
            accumulator.mean += delta / accumulator.count;
            accumulator.squaredDeviation += delta * (estimate - accumulator.mean);
        }
    }

    const standardErrors = Object.fromEntries(entries.map(([key]) => {
        const accumulator = accumulators[key]!;
        return [
            key,
            accumulator.count > 1
                // 重复抽样结果用于估计设计分布的标准差，采用 Bessel 校正 R−1。
                ? Math.sqrt(Math.max(0, accumulator.squaredDeviation / (accumulator.count - 1)))
                : null,
        ];
    }));
    return { standardErrors };
}

function getCachedPpsMonteCarloContext(
    population: Array<Record<string, unknown>>,
    cacheKey: string,
    compute: () => PpsMonteCarloContext | null,
) {
    let cache = ppsContextCache.get(population);
    if (!cache) {
        cache = new Map();
        ppsContextCache.set(population, cache);
    }
    if (cache.has(cacheKey)) {
        const hit = cache.get(cacheKey) ?? null;
        cache.delete(cacheKey);
        cache.set(cacheKey, hit);
        return hit;
    }
    const value = compute();
    cache.set(cacheKey, value);
    while (cache.size > PPS_CONTEXT_CACHE_MAX_ENTRIES) {
        const oldest = cache.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
    return value;
}

function computeMonteCarloPpsMeanSe(
    field: string,
    context: PpsMonteCarloContext | null,
) {
    return context?.standardErrors[field] ?? null;
}

function sampleVariance(values: number[]) {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}

function computeSimpleRandomAccessorSe(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    sampleSize: number,
) {
    const values = population.map(accessor).filter((value): value is number => value !== null);
    if (values.length !== population.length || sampleSize < 1) return null;
    if (sampleSize >= population.length || population.length <= 1) return 0;
    return Math.sqrt((1 - sampleSize / population.length) * sampleVariance(values) / sampleSize);
}

function normalizeConfidenceLevel(value: unknown): "90" | "95" | "99" {
    return value === "90" || value === "99" ? value : "95";
}

function normalizePlannedMargin(value: unknown, kind: "mean" | "proportion") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    if (kind === "proportion") return numeric >= 1 ? numeric / 100 : numeric;
    return numeric;
}

function methodSampleSize(
    method: MethodKey,
    samplingResults: SamplingResultsData | null | undefined,
    rows: Array<Record<string, unknown>>,
) {
    const stored = Number(samplingResults?.[method]?.sampleCount);
    return Number.isInteger(stored) && stored >= 0 ? stored : rows.length || null;
}

function buildTargetMethodAnalysis(params: {
    estimate: number | null;
    standardError: number | null;
    sampleSize: number | null;
    populationSize: number;
    z: number;
    kind: "mean" | "proportion";
}): TargetMethodAnalysis {
    const { estimate, standardError, sampleSize, populationSize, z, kind } = params;
    if (estimate === null || standardError === null || sampleSize === null) {
        return {
            estimate,
            standardError,
            marginOfError: null,
            sampleSize,
            effectiveSampleSize: null,
            reliability: { status: "unavailable", reasons: ["该方法没有可用的目标估计或设计标准误"] },
        };
    }
    if (sampleSize >= populationSize && standardError === 0) {
        return {
            estimate,
            standardError,
            marginOfError: 0,
            sampleSize,
            effectiveSampleSize: populationSize,
            reliability: { status: "census", reasons: ["当前方法覆盖完整虚拟总体"] },
        };
    }

    let effectiveSampleSize: number | null = sampleSize;
    const reasons: string[] = [];
    if (kind === "proportion") {
        effectiveSampleSize = estimate > 0 && estimate < 1 && standardError > 0
            ? Math.min(populationSize, estimate * (1 - estimate) / (standardError ** 2))
            : null;
        if (sampleSize < 30) reasons.push("实际样本量低于30，比例正态近似可能不稳定");
        if (effectiveSampleSize !== null && effectiveSampleSize < 30) reasons.push("设计有效样本量低于30");
        if (estimate <= 0 || estimate >= 1) reasons.push("估计位于0或1边界，不展示为正式置信区间");
    }

    return {
        estimate,
        standardError,
        marginOfError: z * standardError,
        sampleSize,
        effectiveSampleSize,
        reliability: { status: reasons.length ? "caution" : "ok", reasons },
    };
}

export function buildAnalysisMetrics(params: {
    population: Array<Record<string, unknown>>;
    fieldMapping: TopicFieldMapping | null;
    samplingResults: SamplingResultsData | null | undefined;
    studyContract?: ResolvedStudyContract | null;
    samplePlan?: { confidenceLevel?: unknown; marginOfError?: unknown } | null;
    targetOnly?: boolean;
    fieldFilter?: string | null;
}): AnalysisMetricsResult {
    const allNumericFields = unique(params.fieldMapping?.numeric ?? []);
    const allCategoricalFields = getCategoricalFieldsFromTopicMapping(params.fieldMapping);
    const contract = params.studyContract ?? resolveStudyContract(params.fieldMapping);
    const numericFields = params.targetOnly
        ? []
        : params.fieldFilter
            ? allNumericFields.filter((field) => field === params.fieldFilter)
            : allNumericFields;
    const categoricalFields = params.targetOnly
        ? []
        : params.fieldFilter
            ? allCategoricalFields.filter((field) => field === params.fieldFilter)
            : allCategoricalFields;
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
    let targetAccessor: NumericAccessor | null = null;
    if (contract?.contract.target.kind === "mean") {
        targetAccessor = fieldAccessor(contract.contract.target.field);
    } else if (contract?.contract.target.kind === "proportion") {
        const { field, value } = contract.contract.target;
        targetAccessor = (row) => categoryValue(row[field]) === value ? 1 : 0;
    }
    const ppsAccessors = Object.fromEntries(completeNumericFields.map((field) => [field, fieldAccessor(field)]));
    if (targetAccessor) ppsAccessors[TARGET_METRIC_KEY] = targetAccessor;

    const simpleRows = (params.samplingResults?.simple?.data ?? []) as Array<Record<string, unknown>>;
    const systematicRows = (params.samplingResults?.systematic?.data ?? []) as Array<Record<string, unknown>>;
    const ppsRows = (params.samplingResults?.pps?.data ?? []) as Array<Record<string, unknown>>;
    const stratifiedRows = (params.samplingResults?.stratified?.data ?? []) as Array<Record<string, unknown>>;
    const ppsCacheKey = JSON.stringify({
        sizeField: params.samplingResults?.pps?.sizeField,
        sampleCount: params.samplingResults?.pps?.sampleCount,
        fields: completeNumericFields,
        target: contract?.contract.target ?? null,
        replicates: ppsMonteCarloReplicates,
    });
    const ppsMonteCarloContext = params.samplingResults?.pps?.unavailable || Object.keys(ppsAccessors).length === 0
        ? null
        : getCachedPpsMonteCarloContext(params.population, ppsCacheKey, () => buildPpsMonteCarloContext(
                params.population,
                params.samplingResults?.pps?.sizeField,
                params.samplingResults?.pps?.sampleCount,
                ppsAccessors,
                ppsMonteCarloReplicates,
            ));

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
                fieldAccessor(field),
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
                : computeMonteCarloPpsMeanSe(
                    field,
                    ppsMonteCarloContext,
                ),
        };
        methods.stratified = {
            estimate: computeStratifiedMeanEstimate(
                stratifiedRows,
                params.samplingResults?.stratified?.stratifyBy,
                params.samplingResults?.stratified?.layers,
                populationSize,
                fieldAccessor(field),
            ),
            standardError: computeStratifiedMeanSe(
                params.population,
                params.samplingResults?.stratified?.stratifyBy,
                params.samplingResults?.stratified?.layers,
                populationSize,
                fieldAccessor(field),
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

        const populationDistribution = toPopulationPercentages(populationCounts);
        const methods = buildEmptyCategoricalMethodAnalysis();
        methods.simple = estimateSimpleDistribution(simpleRows, field);
        methods.systematic = estimateSimpleDistribution(systematicRows, field);
        methods.pps = params.samplingResults?.pps?.unavailable
            ? {}
            : estimateWeightedDistribution(
                ppsRows,
                field,
                params.samplingResults?.pps?.inclusionProbabilities,
            );
        methods.stratified = computeStratifiedDistributionEstimate(
            stratifiedRows,
            field,
            params.samplingResults?.stratified?.stratifyBy,
            params.samplingResults?.stratified?.layers,
            populationSize,
        );

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

        categorical[field] = limitCategoricalAnalysis({
            population: populationDistribution,
            methods,
            representativeness,
        }, contract?.contract.target.kind === "proportion" && contract.contract.target.field === field
            ? contract.contract.target.value
            : undefined);
    }

    let target: TargetAnalysis | null = null;
    if (contract && targetAccessor) {
        const populationValues = params.population
            .map(targetAccessor)
            .filter((value): value is number => value !== null);
        if (populationValues.length === populationSize && populationSize > 0) {
            const kind = contract.contract.target.kind;
            const confidenceLevel = normalizeConfidenceLevel(params.samplePlan?.confidenceLevel);
            const z = zForConfidenceLevel(confidenceLevel);
            const populationValue = populationValues.reduce((sum, value) => sum + value, 0) / populationValues.length;
            const rowsByMethod: Record<MethodKey, Array<Record<string, unknown>>> = {
                simple: simpleRows,
                systematic: systematicRows,
                pps: ppsRows,
                stratified: stratifiedRows,
            };
            const estimates: Record<MethodKey, number | null> = {
                simple: estimateSimpleValue(simpleRows, targetAccessor),
                systematic: estimateSimpleValue(systematicRows, targetAccessor),
                pps: params.samplingResults?.pps?.unavailable
                    ? null
                    : estimateWeightedValue(ppsRows, targetAccessor, params.samplingResults?.pps?.inclusionProbabilities),
                stratified: computeStratifiedMeanEstimate(
                    stratifiedRows,
                    params.samplingResults?.stratified?.stratifyBy,
                    params.samplingResults?.stratified?.layers,
                    populationSize,
                    targetAccessor,
                ),
            };
            const standardErrors: Record<MethodKey, number | null> = {
                simple: computeSimpleRandomAccessorSe(
                    params.population,
                    targetAccessor,
                    methodSampleSize("simple", params.samplingResults, simpleRows) ?? 0,
                ),
                systematic: computeSystematicExactMeanSe(
                    params.population,
                    targetAccessor,
                    params.samplingResults?.systematic,
                ),
                pps: params.samplingResults?.pps?.unavailable
                    ? null
                    : computeMonteCarloPpsMeanSe(TARGET_METRIC_KEY, ppsMonteCarloContext),
                stratified: computeStratifiedMeanSe(
                    params.population,
                    params.samplingResults?.stratified?.stratifyBy,
                    params.samplingResults?.stratified?.layers,
                    populationSize,
                    targetAccessor,
                ),
            };
            target = {
                contract,
                confidenceLevel,
                plannedMarginOfError: normalizePlannedMargin(params.samplePlan?.marginOfError, kind),
                populationValue,
                methods: Object.fromEntries(METHODS.map((method) => [method, buildTargetMethodAnalysis({
                    estimate: estimates[method],
                    standardError: standardErrors[method],
                    sampleSize: methodSampleSize(method, params.samplingResults, rowsByMethod[method]),
                    populationSize,
                    z,
                    kind,
                })])) as Record<MethodKey, TargetMethodAnalysis>,
            };
        }
    }

    return {
        ppsMonteCarloReplicates,
        numericFields: Object.keys(numeric),
        excludedNumericFields: numericFields.filter((field) => !completeNumericFields.includes(field)),
        categoricalFields: Object.keys(categorical),
        numeric,
        categorical,
        target,
        fieldCatalog: { numeric: allNumericFields, categorical: allCategoricalFields },
    };
}
