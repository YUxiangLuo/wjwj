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
    simple: { label: "简单随机", color: "#6366f1" },
    systematic: { label: "系统抽样", color: "#14b8a6" },
    pps: { label: "PPS抽样", color: "#a855f7" },
    stratified: { label: "分层抽样", color: "#f59e0b" },
};

export const POPULATION_SERIES: ChartSeries = { key: "population", label: "总体", color: "#94a3b8" };
