import type { MethodKey, SamplingResultsData } from "../api-client";
import { createSeededRandom, drawPreparedPPSSample, preparePPSSampling, type PPSSamplingResult } from "../sampling";
import {
    buildPopulationCategoricalStats,
    buildPopulationNumericStats,
    type PopulationNumericStat,
} from "./population-data";

const METHODS: MethodKey[] = ["simple", "systematic", "pps", "stratified"];
const PPS_MONTE_CARLO_REPLICATES = 128;

interface PpsMonteCarloContext {
    replicates: Array<PPSSamplingResult<Record<string, unknown>>>;
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
}

export interface AnalysisMetricsResult {
    numericFields: string[];
    categoricalFields: string[];
    numeric: Record<string, NumericFieldAnalysis>;
    categorical: Record<string, CategoricalFieldAnalysis>;
}

function unique<T>(values: T[]) {
    return Array.from(new Set(values));
}

function getCategoricalFieldsFromMapping(fieldMapping: unknown) {
    if (!fieldMapping || typeof fieldMapping !== "object") return [];
    const data = fieldMapping as Record<string, unknown>;
    const stratified = Array.isArray(data.stratified) ? data.stratified.filter((value): value is string => typeof value === "string") : [];
    const others = Array.isArray(data.others) ? data.others.filter((value): value is string => typeof value === "string") : [];
    return unique([...stratified, ...others]);
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
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
}

function toTrimmedCategory(value: unknown) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text : null;
}

function extractFiniteValues(rows: Array<Record<string, unknown>>, field: string) {
    return rows
        .map((row) => toFiniteNumber(row[field]))
        .filter((value): value is number => value !== null);
}

function estimateSimpleMean(rows: Array<Record<string, unknown>>, field: string) {
    const values = extractFiniteValues(rows, field);
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function estimateWeightedMean(
    rows: Array<Record<string, unknown>>,
    field: string,
    inclusionProbabilities: number[] | undefined,
) {
    if (!Array.isArray(inclusionProbabilities) || inclusionProbabilities.length !== rows.length) {
        return null;
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (let index = 0; index < rows.length; index += 1) {
        const value = toFiniteNumber(rows[index]?.[field]);
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

function computeSystematicExactMeanSe(
    population: Array<Record<string, unknown>>,
    field: string,
    kValue: number,
) {
    if (!Number.isInteger(kValue) || kValue < 1 || population.length === 0) return null;

    const startMeans: number[] = [];
    for (let startIndex = 0; startIndex < kValue; startIndex += 1) {
        const values: number[] = [];
        for (let index = startIndex; index < population.length; index += kValue) {
            const value = toFiniteNumber(population[index]?.[field]);
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

function computeStratifiedMeanEstimate(
    rows: Array<Record<string, unknown>>,
    stratifyBy: string | undefined,
    layers: Array<{ name: string; count: number; sampleCount: number }> | undefined,
    totalPopulation: number,
    field: string,
) {
    if (!stratifyBy || !Array.isArray(layers) || layers.length === 0 || totalPopulation < 1) {
        return null;
    }

    let estimate = 0;
    for (const layer of layers) {
        const layerRows = rows.filter((row) => String(row[stratifyBy] ?? "").trim() === layer.name);
        const values = extractFiniteValues(layerRows, field);
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
    field: string,
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
            .filter((row) => String(row[stratifyBy] ?? "").trim() === layer.name)
            .map((row) => toFiniteNumber(row[field]))
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
): PpsMonteCarloContext | null {
    const normalizedSampleSize = Number(sampleSize);
    if (!sizeField || !Number.isInteger(normalizedSampleSize) || normalizedSampleSize < 1) {
        return null;
    }

    const prepared = preparePPSSampling(population, sizeField, normalizedSampleSize);
    if (!prepared) {
        return null;
    }

    const replicates: Array<PPSSamplingResult<Record<string, unknown>>> = [];
    for (let iteration = 0; iteration < PPS_MONTE_CARLO_REPLICATES; iteration += 1) {
        const replicate = drawPreparedPPSSample(
            prepared,
            createSeededRandom(`analysis-pps-${iteration}`),
        );
        if (replicate.data.length !== normalizedSampleSize) continue;
        replicates.push(replicate as PPSSamplingResult<Record<string, unknown>>);
    }

    return replicates.length > 0 ? { replicates } : null;
}

function computeMonteCarloPpsMeanSe(
    field: string,
    context: PpsMonteCarloContext | null,
) {
    if (!context) {
        return null;
    }

    const estimates: number[] = [];
    for (const replicate of context.replicates) {
        const estimate = estimateWeightedMean(
            replicate.data,
            field,
            replicate.inclusionProbabilities,
        );
        if (estimate !== null) {
            estimates.push(estimate);
        }
    }

    if (estimates.length === 0) return null;

    const meanEstimate = estimates.reduce((sum, value) => sum + value, 0) / estimates.length;
    const variance = estimates.reduce((sum, value) => sum + (value - meanEstimate) ** 2, 0) / estimates.length;
    return Math.sqrt(variance);
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

        const layerRows = rows.filter((row) => String(row[stratifyBy] ?? "").trim() === layer.name);
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

export function buildAnalysisMetrics(params: {
    population: Array<Record<string, unknown>>;
    fieldMapping: unknown;
    samplingResults: SamplingResultsData | null | undefined;
}): AnalysisMetricsResult {
    const numericFields = unique(
        Array.isArray((params.fieldMapping as Record<string, unknown> | null)?.numeric)
            ? ((params.fieldMapping as Record<string, unknown>).numeric as string[])
            : []
    );
    const categoricalFields = getCategoricalFieldsFromMapping(params.fieldMapping);
    const populationSize = params.population.length;

    const populationNumericStats = buildPopulationNumericStats(params.population, numericFields);
    const populationCategoricalCounts = buildPopulationCategoricalStats(params.population, categoricalFields);

    const simpleRows = (params.samplingResults?.simple?.data ?? []) as Array<Record<string, unknown>>;
    const systematicRows = (params.samplingResults?.systematic?.data ?? []) as Array<Record<string, unknown>>;
    const ppsRows = (params.samplingResults?.pps?.data ?? []) as Array<Record<string, unknown>>;
    const stratifiedRows = (params.samplingResults?.stratified?.data ?? []) as Array<Record<string, unknown>>;
    const ppsMonteCarloContext = params.samplingResults?.pps?.unavailable || numericFields.length === 0
        ? null
        : buildPpsMonteCarloContext(
            params.population,
            params.samplingResults?.pps?.sizeField,
            params.samplingResults?.pps?.sampleCount,
        );

    const numeric: Record<string, NumericFieldAnalysis> = {};
    for (const field of numericFields) {
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
                Number(params.samplingResults?.systematic?.kValue),
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

        categorical[field] = {
            population: populationDistribution,
            methods,
            representativeness,
        };
    }

    return {
        numericFields: Object.keys(numeric),
        categoricalFields: Object.keys(categorical),
        numeric,
        categorical,
    };
}
