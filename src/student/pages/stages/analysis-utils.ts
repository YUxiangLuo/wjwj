import type { MethodKey } from "@/domain/experiment/types";
export type { MethodKey };

export interface ChartSeries {
    key: string;
    label: string;
    color: string;
}

export interface ChartRow {
    label: string;
    values: Record<string, number>;
}

export const METHOD_META: Record<MethodKey, { label: string; color: string }> = {
    simple: { label: "简单随机", color: "var(--chart-2)" },
    systematic: { label: "系统抽样", color: "var(--chart-3)" },
    pps: { label: "PPS抽样", color: "var(--chart-4)" },
    stratified: { label: "分层抽样", color: "var(--chart-5)" },
};

export const POPULATION_SERIES: ChartSeries = { key: "population", label: "总体", color: "var(--chart-1)" };

/** 记录来源是 64 位内容哈希；列表只显示前 8 位，完整值放在 title 中供核对。 */
export function shortSourceHash(source: string) {
    return source.slice(0, 8);
}

/** Keep a valid user choice; otherwise fall back to the analysis-target field, then the first field. */
export function preferAnalysisField(fields: string[], current: string, preferred: string): string {
    if (current && fields.includes(current)) return current;
    if (preferred && fields.includes(preferred)) return preferred;
    return fields[0] ?? "";
}
