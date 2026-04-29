import type { MethodKey } from "../../api-client";
import { STUDENT_VISUAL_COLORS } from "../../visual-tokens";
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
    simple: { label: "简单随机", color: STUDENT_VISUAL_COLORS.method.simple },
    systematic: { label: "系统抽样", color: STUDENT_VISUAL_COLORS.method.systematic },
    pps: { label: "PPS抽样", color: STUDENT_VISUAL_COLORS.method.pps },
    stratified: { label: "分层抽样", color: STUDENT_VISUAL_COLORS.method.stratified },
};

export const POPULATION_SERIES: ChartSeries = {
    key: "population",
    label: "总体",
    color: STUDENT_VISUAL_COLORS.analysis.population,
};
