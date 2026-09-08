import type { MethodKey } from "./types";
import type { ResolvedStudyContract } from "../../lib/analysis-target";

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
    ppsStandardErrorMode: "systematic_exact" | "monte_carlo" | "census_exact" | null;
    numericFields: string[];
    excludedNumericFields: string[];
    categoricalFields: string[];
    numeric: Record<string, NumericFieldAnalysis>;
    categorical: Record<string, CategoricalFieldAnalysis>;
    target: TargetAnalysis | null;
}

export type AnalysisNumericFieldMetrics = NumericFieldAnalysis;
export type AnalysisCategoricalFieldMetrics = CategoricalFieldAnalysis;
export type TargetMethodMetrics = TargetMethodAnalysis;
export type TargetAnalysisMetrics = TargetAnalysis;

/** Browser contracts accept older responses missing these optional analysis fields. */
type OptionalAnalysisFields = "ppsMonteCarloReplicates" | "ppsStandardErrorMode" | "excludedNumericFields" | "target";
export type AnalysisMetricsData = Omit<AnalysisMetricsResult, OptionalAnalysisFields>
    & Partial<Pick<AnalysisMetricsResult, OptionalAnalysisFields>>;
