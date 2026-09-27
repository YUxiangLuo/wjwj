import {
    toTrimmedCategory,
    type NumericAccessor,
    fieldAccessor,
    extractAccessorValues,
    estimateSimpleValue,
    sampleStandardDeviation,
    scaledMean,
} from "./values";
import { computeSimpleRandomValueSe, computeFinitePopulationEquivalentSampleSize } from "./srs";
import { computeSystematicExactValueSe } from "./systematic";
import { computeStratifiedValueEstimate, computeStratifiedValueSe } from "./stratified";
import { type PpsStandardErrorContext, estimateWeightedValue, buildPpsStandardErrorContext } from "./pps";
import type { MethodKey, SamplingResultsData } from "../experiment/types";
import type { ResolvedStudyContract } from "../../lib/analysis-target";
import { zForConfidenceLevel } from "./confidence-level";
import { isCompletedSamplingResult, SAMPLING_METHODS as METHODS } from "../../lib/sampling-policy";
import type { TargetMethodAnalysis, TargetAnalysis } from "../experiment/analysis-types";

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
 * 给出每种抽样方法的目标估计、设计标准误、正态近似教学半宽、有限总体等效 SRS 样本量与可靠性提示。
 * 比例目标通过 0/1 指示变量复用全部均值机制；均值目标的 PPS 标准误直接共享数值字段上下文。
 */
export function buildTargetAnalysis(params: {
    contract: ResolvedStudyContract;
    population: Array<Record<string, unknown>>;
    samplingResults: SamplingResultsData | null | undefined;
    confidenceLevel: "90" | "95" | "99";
    plannedMarginOfError: number | null;
    unit?: string | null;
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
            return category.normalize("NFKC") === target.value.normalize("NFKC") ? 1 : 0;
        };

    const populationValues = extractAccessorValues(population, accessor);
    if (populationValues.length === 0) return null;
    // 与数值字段的 fail-closed 约定一致：均值目标在数据不完整时不给目标分析。
    if (populationValues.length !== populationSize) return null;
    const populationValue = scaledMean(populationValues)!;
    const populationSd = sampleStandardDeviation(populationValues);
    const populationVar = populationSd * populationSd;
    if (!Number.isFinite(populationValue) || !Number.isFinite(populationVar)) return null;

    const simpleRows = (params.samplingResults?.simple?.data ?? []) as Array<Record<string, unknown>>;
    const systematicRows = (params.samplingResults?.systematic?.data ?? []) as Array<Record<string, unknown>>;
    const ppsRows = (params.samplingResults?.pps?.data ?? []) as Array<Record<string, unknown>>;
    const stratifiedRows = (params.samplingResults?.stratified?.data ?? []) as Array<Record<string, unknown>>;
    const ppsUnavailable = Boolean(params.samplingResults?.pps?.unavailable);
    const ppsCompleted = isCompletedSamplingResult(params.samplingResults?.pps);

    let ppsSe: number | null = null;
    if (ppsCompleted && !ppsUnavailable) {
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
            standardError: computeSimpleRandomValueSe(populationVar, populationSize, extractAccessorValues(simpleRows, accessor).length, populationSd),
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
        if (!isCompletedSamplingResult(params.samplingResults?.[method])) continue;
        const raw = methodInputs[method];
        const estimate = raw.estimate !== null && Number.isFinite(raw.estimate) ? raw.estimate : null;
        const standardError = raw.standardError !== null && Number.isFinite(raw.standardError) && raw.standardError >= 0
            ? raw.standardError : null;
        const sampleSize = raw.sampleSize;
        const rawMarginOfError = standardError !== null ? z * standardError : null;
        const marginOfError = rawMarginOfError !== null && Number.isFinite(rawMarginOfError) ? rawMarginOfError : null;
        const isCensus = sampleSize !== null && sampleSize >= populationSize;

        let effectiveSampleSize: number | null = null;
        if (isCensus) {
            effectiveSampleSize = populationSize;
        } else if (standardError !== null && sampleSize !== null) {
            effectiveSampleSize = computeFinitePopulationEquivalentSampleSize(
                populationVar,
                populationSize,
                standardError,
                populationSd,
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
        if (method === "pps" && estimate !== null && standardError === null && !ppsUnavailable) {
            analysis.reliability.reasons = ["PPS 设计标准误无法可靠计算，请检查规模变量与数值精度"];
        }
        if (estimate !== null && standardError !== null && marginOfError === null) {
            analysis.reliability.reasons = ["正态近似教学半宽超出可靠数值范围"];
        }
        if (estimate !== null && standardError !== null && marginOfError !== null) {
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
                if (sampleSize !== null && sampleSize < 30) reasons.push("实际入样量低于 30，不能仅凭等效样本量判断近似条件");
                const rows = method === "simple" ? simpleRows : method === "systematic" ? systematicRows : method === "pps" ? ppsRows : stratifiedRows;
                const observed = extractAccessorValues(rows, accessor);
                if (target.kind === "proportion") {
                    const events = observed.reduce((sum, value) => sum + value, 0);
                    const expectedMinority = observed.length * Math.min(populationValue, 1 - populationValue);
                    if (Math.min(events, observed.length - events) < 5 || expectedMinority < 5) {
                        reasons.push("事件或非事件数量偏少，对称正态区间可能覆盖不足");
                    }
                } else {
                    const squaredDeviations = populationValues.map((value) => (value - populationValue) ** 2);
                    const total = squaredDeviations.reduce((sum, value) => sum + value, 0);
                    if (total > 0 && squaredDeviations.some((value) => value > total * 0.1)) {
                        reasons.push("总体含高影响单位（单个单位占离差平方和超过 10%），需检查区间近似");
                    }
                }
                if (method === "systematic") reasons.push("系统抽样的区间覆盖取决于排序与起点分布，尚未验证");
                if (method === "pps") reasons.push("PPS 比估计可能有偏，设计标准误不能保证区间覆盖");
                if (params.plannedMarginOfError !== null && marginOfError !== null
                    && marginOfError > params.plannedMarginOfError * (1 + 1e-9)) {
                    reasons.push("正态近似教学半宽超过规划误差限");
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
        unit: target.kind === "proportion" ? "%" : params.unit?.trim() ?? "",
        populationValue,
        methods,
    };
}
