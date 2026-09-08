export function unique<T>(values: T[]) {
    return Array.from(new Set(values));
}

function toFiniteNumber(value: unknown) {
    if (value === undefined || value === null || (typeof value === "string" && value.trim() === "")) {
        return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
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

export function estimateSimpleValue(rows: Array<Record<string, unknown>>, accessor: NumericAccessor) {
    const values = extractAccessorValues(rows, accessor);
    if (values.length === 0) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function estimateSimpleMean(rows: Array<Record<string, unknown>>, field: string) {
    return estimateSimpleValue(rows, fieldAccessor(field));
}

export function sampleVariance(values: number[]) {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
}
