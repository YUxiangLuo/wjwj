import type { ResolvedStudyContract } from "../../lib/analysis-target";
import type { MethodKey } from "../api-client";

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
    truncated?: boolean;
    totalCategoryCount?: number;
    aggregatedCategoryLabel?: string;
}

export interface TargetMethodAnalysis {
    estimate: number | null;
    standardError: number | null;
    marginOfError: number | null;
    sampleSize: number | null;
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
    populationValue: number;
    methods: Record<MethodKey, TargetMethodAnalysis>;
}

export interface AnalysisMetricsResult {
    ppsMonteCarloReplicates: number;
    numericFields: string[];
    excludedNumericFields: string[];
    categoricalFields: string[];
    numeric: Record<string, NumericFieldAnalysis>;
    categorical: Record<string, CategoricalFieldAnalysis>;
    target: TargetAnalysis | null;
    fieldCatalog: { numeric: string[]; categorical: string[] };
}
