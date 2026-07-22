import type { MethodKey } from "../../api-client";
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
