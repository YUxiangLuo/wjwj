export type RawValue = string | number | boolean | null;

export interface VariableDefinition {
    field: string;
    label: string;
    unit: string;
    kind: "continuous" | "nominal" | "ordinal" | "identifier";
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
    /** 可选：分组交叉对比维度字段（用于商务细分客群对比分析） */
    groupByField?: string;
    /** 可选：分析所属实验波次（默认当前波次） */
    waveNumber?: number;
    /** 可选：使用质检后有效回收样本或完整入样名单 */
    datasetMode?: "cleaned_respondents" | "full_invited";
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

export interface CrossTabGroupRow {
    groupValue: RawValue;
    groupLabel: string;
    validCount: number;
    mean?: number | null;
    sampleStandardDeviation?: number | null;
    categories?: Array<{ value: RawValue; label: string; count: number; proportion: number | null }>;
}

export interface CrossTabAnalysisResult extends AnalysisResultBase {
    kind: "crosstab";
    groupField: string;
    groupLabel: string;
    targetKind: "numeric" | "categorical";
    groups: CrossTabGroupRow[];
}

export type AnalysisResult =
    | NumericAnalysisResult
    | CategoricalAnalysisResult
    | CrossTabAnalysisResult;

export interface SavedAnalysisView {
    id: number;
    waveNumber?: number;
    config: AnalysisConfig;
    variable: VariableDefinition;
    result: AnalysisResult;
    source: string;
    dictionaryRevision: number;
    samplingGeneration: number;
    algorithmVersion: string;
    createdAt: string;
    stale: boolean;
}
