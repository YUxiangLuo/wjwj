export type RawValue = string | number | boolean | null;

export interface VariableDefinition {
    field: string;
    label: string;
    unit: string;
    kind: "continuous" | "nominal" | "ordinal";
    categories: Array<{ value: RawValue; label: string }>;
    missing: RawValue[];
}

export interface VariableDictionary {
    source: string;
    revision: number;
    variables: VariableDefinition[];
}

export interface AnalysisConfig {
    question: string;
    method: "simple" | "systematic" | "pps" | "stratified";
    field: string;
    weighted: boolean;
}

interface AnalysisResultBase {
    sampleCount: number;
    validCount: number;
    missingCount: number;
    weighted: boolean;
}

export interface NumericAnalysisResult extends AnalysisResultBase {
    kind: "numeric";
    mean: number | null;
    sampleStandardDeviation: number | null;
    min: number | null;
    max: number | null;
    q1: number | null;
    median: number | null;
    q3: number | null;
}

export interface CategoricalAnalysisResult extends AnalysisResultBase {
    kind: "categorical";
    categories: Array<{ value: RawValue; label: string; count: number; proportion: number | null }>;
}

export type AnalysisResult = NumericAnalysisResult | CategoricalAnalysisResult;
