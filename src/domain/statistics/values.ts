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

const VELTKAMP_SPLITTER = 134217729; // 2^27 + 1

/**
 * Largest finite IEEE-754 power of two <= scale (clamped to [2^-1074, 2^1023]).
 * Dividing or multiplying by a power of two only shifts the binary exponent,
 * preserving every mantissa bit without introducing repeating-fraction error.
 */
export function powerOfTwoScale(scale: number): number {
    if (!Number.isFinite(scale) || scale <= 0) return 1;
    let exp = Math.min(1023, Math.max(-1074, Math.floor(Math.log2(scale))));
    let pow2 = 2 ** exp;
    if (pow2 > scale && exp > -1074) {
        exp -= 1;
        pow2 = 2 ** exp;
    }
    return pow2;
}

/**
 * Error-free Veltkamp/Dekker two-product accumulation into StableSum so a 54..106-bit
 * exact product (e.g. 3 * -1e100 or 1.5 * -1e100) never loses its low mantissa bits
 * before cancelling opposing large terms.
 */
export function addExactProduct(sum: StableSum, a: number, b: number): number {
    const hi = a * b;
    if (!Number.isFinite(hi) || hi === 0) {
        sum.add(hi);
        return hi;
    }
    const absA = Math.abs(a);
    const absB = Math.abs(b);
    if (absA <= 2 ** 995 && absB <= 2 ** 995 && Math.abs(hi) >= 2 ** -968) {
        const ca = VELTKAMP_SPLITTER * a;
        const aHi = ca - (ca - a);
        const aLo = a - aHi;
        const cb = VELTKAMP_SPLITTER * b;
        const bHi = cb - (cb - b);
        const bLo = b - bHi;
        const lo = ((aHi * bHi - hi) + aHi * bLo + aLo * bHi) + aLo * bLo;
        sum.add(hi);
        if (lo !== 0) sum.add(lo);
        return hi;
    }
    if (Math.abs(hi) >= 2 ** -968) {
        const scaleA = powerOfTwoScale(absA);
        const scaleB = powerOfTwoScale(absB);
        const na = a / scaleA;
        const nb = b / scaleB;
        const nHi = na * nb;
        const ca = VELTKAMP_SPLITTER * na;
        const aHi = ca - (ca - na);
        const aLo = na - aHi;
        const cb = VELTKAMP_SPLITTER * nb;
        const bHi = cb - (cb - nb);
        const bLo = nb - bHi;
        const nLo = ((aHi * bHi - nHi) + aHi * bLo + aLo * bHi) + aLo * bLo;
        const lo = nLo * (scaleA * scaleB);
        sum.add(hi);
        if (Number.isFinite(lo) && lo !== 0) sum.add(lo);
        return hi;
    }
    sum.add(hi);
    return hi;
}

/**
 * Shift only when Sterbenz's lemma guarantees bit-exact subtraction on same-sign
 * clusters; otherwise keep center = 0 so opposing large terms cancel losslessly
 * inside StableSum.
 */
export function scaledMean(values: number[]) {
    if (values.length === 0) return null;
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const value of values) {
        if (Number.isNaN(value)) return Number.NaN;
        if (value < minimum) minimum = value;
        if (value > maximum) maximum = value;
    }
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
        const nonFinite = new StableSum();
        for (const value of values) nonFinite.add(value);
        return nonFinite.value / values.length;
    }
    const center =
        (minimum > 0 && maximum <= 2 * minimum) || (maximum < 0 && minimum >= 2 * maximum)
            ? minimum
            : 0;
    let scale = 0;
    for (const value of values) {
        const abs = Math.abs(value - center);
        if (abs > scale) scale = abs;
    }
    if (scale === 0) return Object.is(center, -0) ? 0 : center;
    // Sum centered values in their original units when that sum is finite.
    const unscaled = new StableSum();
    for (const value of values) unscaled.add(value - center);
    if (Number.isFinite(unscaled.value)) {
        const out = center + unscaled.value / values.length;
        return Object.is(out, -0) ? 0 : out;
    }
    // Retain the overflow-safe path using an exact power-of-two scale when the sum exceeds range.
    const pow2Scale = powerOfTwoScale(scale);
    const sum = new StableSum();
    for (const value of values) sum.add((value - center) / pow2Scale);
    const out = center + (sum.value / values.length) * pow2Scale;
    return Object.is(out, -0) ? 0 : out;
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
