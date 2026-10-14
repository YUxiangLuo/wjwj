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

/** Center before scaling to preserve small differences on a large baseline. */
export function scaledMean(values: number[]) {
    if (values.length === 0) return null;
    const minimum = values.reduce((result, value) => Math.min(result, value), Infinity);
    const maximum = values.reduce((result, value) => Math.max(result, value), -Infinity);
    const center = minimum / 2 + maximum / 2;
    const scale = values.reduce((maximum, value) => Math.max(maximum, Math.abs(value - center)), 0);
    if (scale === 0) return center;
    // Scaling first can underflow a tiny residual before opposing large terms
    // cancel. Sum centered values in their original units when that sum is finite.
    const unscaled = new StableSum();
    for (const value of values) unscaled.add(value - center);
    if (Number.isFinite(unscaled.value)) return center + unscaled.value / values.length;
    // Retain the overflow-safe path when the sum exceeds the numeric range.
    const sum = new StableSum();
    for (const value of values) sum.add((value - center) / scale);
    return center + (sum.value / values.length) * scale;
}

export function estimateSimpleValue(rows: Array<Record<string, unknown>>, accessor: NumericAccessor) {
    const values = extractAccessorValues(rows, accessor);
    return scaledMean(values);
}

export function estimateSimpleMean(rows: Array<Record<string, unknown>>, field: string) {
    return estimateSimpleValue(rows, fieldAccessor(field));
}

export function sampleVariance(values: number[]) {
    const standardDeviation = sampleStandardDeviation(values);
    return standardDeviation * standardDeviation;
}

/** Keep the unsquared dispersion available when variance would underflow. */
export function sampleStandardDeviation(values: number[]) {
    if (values.length < 2) return 0;
    const minimum = values.reduce((result, value) => Math.min(result, value), Infinity);
    const maximum = values.reduce((result, value) => Math.max(result, value), -Infinity);
    // Midrange centering avoids losing small within-field differences merely
    // because every value shares a large offset. Halving first avoids overflow
    // when finite endpoints have the same sign near Number.MAX_VALUE.
    const center = minimum / 2 + maximum / 2;
    const deviations = values.map(value => value - center);
    const scale = deviations.reduce((result, value) => Math.max(result, Math.abs(value)), 0);
    if (scale === 0) return 0;
    const normalizedMean = scaledMean(deviations)! / scale;
    const squares = new StableSum();
    for (const deviation of deviations) squares.add((deviation / scale - normalizedMean) ** 2);
    return Math.sqrt(Math.max(0, squares.value) / (values.length - 1)) * scale;
}
