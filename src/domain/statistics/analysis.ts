import { unique, fieldAccessor, extractFiniteValues, estimateSimpleMean } from "./values";
import { computeSimpleRandomMeanSe } from "./srs";
import { computeSystematicExactMeanSe } from "./systematic";
import {
    computeStratifiedMeanEstimate,
    computeStratifiedMeanSe,
    computeStratifiedDistributionEstimate,
} from "./stratified";
import {
    estimateWeightedMean,
    estimateWeightedDistribution,
    buildPpsStandardErrorContext,
    computePpsMeanSe,
} from "./pps";
import {
    estimateSimpleDistribution,
    computeDistributionRepresentativeness,
    toPopulationPercentages,
    truncateCategoricalDistributions,
} from "./distributions";
import { buildTargetAnalysis } from "./target";
import type { MethodKey, SamplingResultsData } from "../experiment/types";
import { type ResolvedStudyContract, resolveStudyContract } from "../../lib/analysis-target";
import { normalizeConfidenceLevel } from "./confidence-level";
import { isCompletedSamplingResult, SAMPLING_METHODS as METHODS } from "../../lib/sampling-policy";
import { createSafeRecord } from "../../lib/safe-record";
import {
    buildPopulationCategoricalStats,
    buildPopulationNumericStats,
    getCategoricalFieldsFromTopicMapping,
    type TopicFieldMapping,
} from "./population";
import type {
    NumericMethodAnalysis,
    NumericFieldAnalysis,
    CategoricalFieldAnalysis,
    AnalysisMetricsResult,
} from "../experiment/analysis-types";

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
    /** @deprecated 当前精确积分不受旧模拟次数配置影响。 */
    ppsMonteCarloReplicates?: number;
}): AnalysisMetricsResult {
    const numericFields = unique(params.fieldMapping?.numeric ?? []);
    const categoricalFields = getCategoricalFieldsFromTopicMapping(params.fieldMapping);
    const populationSize = params.population.length;
    const resolvedContract = params.studyContract !== undefined
        ? params.studyContract
        : resolveStudyContract(params.fieldMapping, { topicName: params.topicName });
    const completedMethods = new Set(METHODS.filter((method) => (
        isCompletedSamplingResult(params.samplingResults?.[method])
    )));
    const ppsMonteCarloReplicates = 0; // Exact integration; retained fields support old API consumers.

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
    const ppsStandardErrorContext = !completedMethods.has("pps") || completeNumericFields.length === 0
        ? null
        : buildPpsStandardErrorContext(
            params.population,
            params.samplingResults?.pps?.sizeField,
            params.samplingResults?.pps?.sampleCount,
            completeNumericFields.map((field) => ({ key: field, accessor: fieldAccessor(field) })),
            ppsMonteCarloReplicates,
        );

    const numeric = createSafeRecord<NumericFieldAnalysis>();
    for (const field of completeNumericFields) {
        const populationStat = populationNumericStats[field];
        if (!populationStat) continue;

        const methods = buildEmptyNumericMethodAnalysis();
        if (completedMethods.has("simple")) {
            methods.simple = {
                estimate: estimateSimpleMean(simpleRows, field),
                standardError: computeSimpleRandomMeanSe(populationStat, populationSize, extractFiniteValues(simpleRows, field).length),
            };
        }
        if (completedMethods.has("systematic")) {
            methods.systematic = {
                estimate: estimateSimpleMean(systematicRows, field),
                standardError: computeSystematicExactMeanSe(
                    params.population,
                    field,
                    params.samplingResults?.systematic,
                ),
            };
        }
        if (completedMethods.has("pps")) {
            methods.pps = {
                estimate: estimateWeightedMean(
                    ppsRows,
                    field,
                    params.samplingResults?.pps?.inclusionProbabilities,
                ),
                standardError: computePpsMeanSe(
                    field,
                    ppsStandardErrorContext,
                ),
            };
        }
        if (completedMethods.has("stratified")) {
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
        }

        numeric[field] = {
            populationMean: populationStat.mean,
            populationVariance: populationStat.variance,
            methods,
        };
    }

    const categorical = createSafeRecord<CategoricalFieldAnalysis>();
    for (const field of categoricalFields) {
        const populationCounts = populationCategoricalCounts[field];
        if (!populationCounts) continue;

        const fullPopulationDistribution = toPopulationPercentages(populationCounts);
        const fullMethods = buildEmptyCategoricalMethodAnalysis();
        if (completedMethods.has("simple")) {
            fullMethods.simple = estimateSimpleDistribution(simpleRows, field);
        }
        if (completedMethods.has("systematic")) {
            fullMethods.systematic = estimateSimpleDistribution(systematicRows, field);
        }
        if (completedMethods.has("pps")) {
            fullMethods.pps = estimateWeightedDistribution(
                ppsRows,
                field,
                params.samplingResults?.pps?.inclusionProbabilities,
            );
        }
        if (completedMethods.has("stratified")) {
            fullMethods.stratified = computeStratifiedDistributionEstimate(
                stratifiedRows,
                field,
                params.samplingResults?.stratified?.stratifyBy,
                params.samplingResults?.stratified?.layers,
                populationSize,
            );
        }

        // 聚合仅用于展示，完整类别空间的偏差不随图表截断改变。
        const target = resolvedContract?.contract.target;
        const preserved = target?.kind === "proportion" && target.field === field
            ? [target.value.trim().normalize("NFKC")] : [];
        const truncated = truncateCategoricalDistributions(fullPopulationDistribution, fullMethods, preserved);
        const populationDistribution = truncated?.population ?? fullPopulationDistribution;
        const methods = truncated?.methods ?? fullMethods;

        const representativeness = buildEmptyRepresentativeness();
        for (const method of METHODS) {
            if (!completedMethods.has(method)) {
                representativeness[method] = null;
                continue;
            }
            representativeness[method] = computeDistributionRepresentativeness(
                fullPopulationDistribution,
                fullMethods[method],
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
        ppsMonteCarloReplicates: 0,
        ppsStandardErrorMode: ppsStandardErrorContext?.mode
            ?? (target?.methods.pps.standardError != null
                ? ppsRows.length === populationSize ? "census_exact" : "systematic_exact"
                : null),
        numericFields: Object.keys(numeric),
        excludedNumericFields: numericFields.filter((field) => !completeNumericFields.includes(field)),
        categoricalFields: Object.keys(categorical),
        numeric,
        categorical,
        target,
    };
}
