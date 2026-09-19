import { parseNumericText } from "../../lib/numeric-text";
import { StableSum } from "./stable-sum";

export function unique<T>(values: T[]) {
    return Array.from(new Set(values));
}

function toFiniteNumber(value: unknown) {
    return parseNumericText(value);
}

export function toTrimmedCategory(value: unknown) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim().normalize("NFKC");
    return text ? text : null;
}

/** 从数据行提取数值的访问器：均值目标直接读字段，比例目标映射为 0/1 指示变量。 */
export type NumericAccessor = (row: Record<string, unknown>) => number | null;

export function fieldAccessor(field: string): NumericAccessor {
    return (row) => toFiniteNumber(row[field]);
}

export function extractFiniteValues(rows: Array<Record<string, unknown>>, field: string) {
    return rows
        .map((row) => toFiniteNumber(row[field]))
        .filter((value): value is number => value !== null);
}

export function extractAccessorValues(rows: Array<Record<string, unknown>>, accessor: NumericAccessor) {
    const values: number[] = [];
    for (const row of rows) {
        const value = accessor(row);
        if (value !== null) values.push(value);
    }
    return values;
}

/** Scale before compensated summation so finite means survive large cancellation. */
export function scaledMean(values: number[]) {
    if (values.length === 0) return null;
    const scale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
    if (scale === 0) return 0;
    const sum = new StableSum();
    for (const value of values) sum.add(value / scale);
    return (sum.value / values.length) * scale;
}

export function estimateSimpleValue(rows: Array<Record<string, unknown>>, accessor: NumericAccessor) {
    const values = extractAccessorValues(rows, accessor);
    return scaledMean(values);
}

export function estimateSimpleMean(rows: Array<Record<string, unknown>>, field: string) {
    return estimateSimpleValue(rows, fieldAccessor(field));
}

export function sampleVariance(values: number[]) {
    if (values.length < 2) return 0;
    const scale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
    if (scale === 0) return 0;
    const normalizedMean = scaledMean(values)! / scale;
    const squares = new StableSum();
    for (const value of values) squares.add((value / scale - normalizedMean) ** 2);
    const standardDeviation = Math.sqrt(Math.max(0, squares.value) / (values.length - 1)) * scale;
    return standardDeviation * standardDeviation;
}
