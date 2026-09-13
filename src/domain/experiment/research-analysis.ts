import type { VariableDefinition, VariableValue } from "./variable-dictionary";

export class ResearchAnalysisError extends Error {
    constructor(message: string, public readonly code = "INVALID_RESEARCH_ANALYSIS", public readonly status = 409) { super(message); }
}

export const RESEARCH_METHODS = ["simple", "systematic", "pps", "stratified"] as const;
export type ResearchMethod = typeof RESEARCH_METHODS[number];
export interface ResearchSpec {
    schemaVersion: 1;
    question: string;
    method: ResearchMethod;
    variableId: string;
    mode: "raw" | "design-weighted";
}
export interface DescriptiveResult {
    kind: "numeric" | "categorical";
    sampleCount: number;
    validCount: number;
    missingCount: number;
    weightSum: number;
    mean: number | null;
    sampleSD: number | null;
    min: number | null;
    q1: number | null;
    median: number | null;
    q3: number | null;
    max: number | null;
    categories: Array<{ value: VariableValue; label: string; count: number; proportion: number | null }>;
    notes: string[];
}
export interface ResearchRun {
    id: string;
    schemaVersion: 1;
    algorithmVersion: "descriptive-v1";
    createdAt: string;
    spec: ResearchSpec;
    variable: VariableDefinition;
    source: {
        fingerprint: string;
        datasetRevision: string;
        dictionaryRevision: number;
        populationFileSha256: string;
        populationSize: number;
        sampleRevision: string;
        samplingRevision: number;
        parserVersion: "spreadsheet-v2";
        samplingAlgorithmVersion: "sampling-v2";
    };
    result: DescriptiveResult;
}
export interface ResearchList {
    dictionary: import("./variable-dictionary").VariableDictionaryV1 | null;
    sourceError: string | null;
    references: string[];
    methods: ResearchMethod[];
    runs: Array<{ run: ResearchRun; current: boolean }>;
}
export function parseResearchSpec(raw: unknown): ResearchSpec | string {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "分析配置必须是对象";
    const r = raw as Record<string, unknown>;
    if (Object.keys(r).length !== 5 || Object.keys(r).some(k => !["schemaVersion", "question", "method", "variableId", "mode"].includes(k)) || r.schemaVersion !== 1) return "分析配置版本或字段无效，不接受样本、权重或客户端计算结果";
    if (typeof r.question !== "string" || !r.question.trim() || r.question.length > 300 || r.question.includes("\0") || !r.question.isWellFormed()) return "请填写 1–300 字的分析问题";
    if (!(RESEARCH_METHODS as readonly unknown[]).includes(r.method)) return "请选择一种实际完成的抽样方法";
    if (typeof r.variableId !== "string" || !/^v_[1-9]\d{0,2}$/.test(r.variableId)) return "变量身份无效";
    if (r.mode !== "raw" && r.mode !== "design-weighted") return "请选择原始描述或设计加权点估计";
    return { schemaVersion: 1, question: r.question, method: r.method as ResearchMethod, variableId: r.variableId, mode: r.mode };
}
export function parseResearchReferences(raw: unknown): string[] | string {
    if (!Array.isArray(raw) || raw.length > 10 || raw.some(id => typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) || new Set(raw).size !== raw.length) return "报告最多引用10条不同的已保存分析，请重新核对引用身份";
    return [...raw];
}
