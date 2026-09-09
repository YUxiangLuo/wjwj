import { createSafeRecord } from "../../lib/safe-record";
import { StableSum } from "./stable-sum";

export function createSeededRandom(seed?: number | string) {
    if (seed === undefined || seed === null || seed === "") {
        return Math.random;
    }

    const seedText = String(seed);
    let hash = 2166136261;
    for (let i = 0; i < seedText.length; i++) {
        hash ^= seedText.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    let state = hash >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function performSimpleSamplingWithIndices<T>(data: T[], n: number, random: () => number) {
    const sampleSize = Math.max(0, Math.min(Number(n) || 0, data.length));
    // The partial shuffle draws only n positions; allocating the index frame is still O(N).
    const indices = Array.from({ length: data.length }, (_, i) => i);

    for (let i = indices.length - 1; i >= indices.length - sampleSize && i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const temp = indices[i]!;
        indices[i] = indices[j]!;
        indices[j] = temp;
    }

    const selectedIndices = indices.slice(indices.length - sampleSize);
    return {
        data: selectedIndices.map((index) => data[index]!),
        indices: selectedIndices,
    };
}

export function performSimpleSampling<T>(data: T[], n: number, random: () => number): T[] {
    return performSimpleSamplingWithIndices(data, n, random).data;
}

export interface SystematicSamplingResult<T> {
    data: T[];
    indices: number[];
    interval: number;
    randomStart: number;
}

/**
 * Linear systematic sampling with a fractional interval.
 *
 * For population size N and target sample size n, K=N/n and the selected
 * zero-based indices are floor(r + jK), j=0..n-1, where r is uniform in
 * [0, K). Since K is always at least 1, this produces exactly n unique
 * in-range units.
 */
export function performSystematicSampling<T>(
    data: T[],
    n: number,
    random: () => number,
): SystematicSamplingResult<T> {
    const sampleSize = Math.max(0, Math.min(Math.floor(Number(n) || 0), data.length));
    if (sampleSize === 0) {
        return { data: [], indices: [], interval: 0, randomStart: 0 };
    }

    const interval = data.length / sampleSize;
    const randomUnit = Math.min(Math.max(Number(random()) || 0, 0), 1 - Number.EPSILON);
    const randomStart = randomUnit * interval;
    const indices = Array.from(
        { length: sampleSize },
        (_, index) => Math.floor(randomStart + index * interval),
    );

    return {
        data: indices.map((index) => data[index]!),
        indices,
        interval,
        randomStart,
    };
}

export function stratumKey(value: unknown): string {
    if (value === undefined || value === null) return "";
    return String(value).trim().normalize("NFKC");
}

export function performStratifiedSamplingWithIndices<T extends Record<string, unknown>>(
    data: T[],
    stratifyBy: string,
    layers: Array<{ name: unknown; sampleCount: number }>,
    random: () => number,
) {
    const result: T[] = [];
    const selectedIndices: number[] = [];
    const groups = createSafeRecord<Array<{ row: T; index: number }>>();
    for (let index = 0; index < data.length; index += 1) {
        const row = data[index]!;
        const value = stratumKey(row[stratifyBy]);
        if (!value) continue;
        (groups[value] ??= []).push({ row, index });
    }

    for (const layer of layers) {
        const groupData = groups[stratumKey(layer.name)] || [];
        if (layer.sampleCount > 0 && groupData.length > 0) {
            const sampled = performSimpleSampling(groupData, layer.sampleCount, random);
            result.push(...sampled.map((entry) => entry.row));
            selectedIndices.push(...sampled.map((entry) => entry.index));
        }
    }

    return { data: result, indices: selectedIndices };
}

export function performStratifiedSampling<T extends Record<string, unknown>>(
    data: T[],
    stratifyBy: string,
    layers: Array<{ name: unknown; sampleCount: number }>,
    random: () => number,
): T[] {
    return performStratifiedSamplingWithIndices(data, stratifyBy, layers, random).data;
}

export interface PPSSamplingResult<T> {
    data: T[];
    indices: number[];
    inclusionProbabilities: number[];
    randomStart: number;
    probabilitySummary?: PpsProbabilitySummary;
}

export interface PpsProbabilitySummary {
    populationCount: number;
    probabilitySum: number;
    minInclusionProbability: number;
    maxInclusionProbability: number;
    certaintyUnitCount: number;
}

export interface PreparedPPSSampling<T> {
    data: T[];
    sampleSize: number;
    designFrame: PpsDesignFrame;
}

// CSV/JSON sizes use decimal notation. At an ambiguous certainty boundary,
// compare their canonical decimal values exactly (units of 10^-324), so e.g.
// 0.3 = 0.1 + 0.2 without also erasing a genuinely positive residual of 1e-20.
// Only the rare boundary comparison pays for BigInt arithmetic.
function exactPositiveMass(value: number): bigint {
    const [coefficient, exponentText] = String(value).split("e");
    const [integer, fraction = ""] = coefficient!.split(".");
    const exponent = Number(exponentText ?? 0) - fraction.length + 324;
    return BigInt(integer! + fraction) * 10n ** BigInt(exponent);
}

function toPositiveSizeValue(value: unknown) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

interface PpsDesignFrame {
    certaintyIndices: number[];
    certaintyProbabilities: number[];
    systematicIndices: number[];
    systematicProbabilities: number[];
    systematicSampleSize: number;
}

function buildPpsWithoutReplacementDesign(sizes: number[], sampleSize: number): PpsDesignFrame | null {
    const positiveIndices = sizes
        .map((size, index) => ({ size, index }))
        .filter((entry) => entry.size > 0)
        .map((entry) => entry.index);

    if (sampleSize < 1 || positiveIndices.length < sampleSize) {
        return null;
    }

    let activeIndices = [...positiveIndices];
    let remainingSampleSize = sampleSize;
    const certaintyIndices: number[] = [];
    const certaintyProbabilities: number[] = [];
    let scaledSizes: number[] = [];
    let remainingTotal = 0;
    let scale = 0;

    while (remainingSampleSize > 0 && activeIndices.length > 0) {
        if (remainingSampleSize === activeIndices.length) {
            for (const index of activeIndices) {
                certaintyIndices.push(index);
                certaintyProbabilities.push(1);
            }
            activeIndices = [];
            remainingSampleSize = 0;
            break;
        }
        // Recompute from the remaining frame, never subtract a dominant mass
        // from an inexact total. Re-scaling each round also recovers tiny units
        // after a certainty unit is removed, and prevents overflowing totals.
        scale = 0;
        for (const index of activeIndices) scale = Math.max(scale, sizes[index]!);
        scaledSizes = activeIndices.map(index => sizes[index]! / scale);
        const total = new StableSum();
        for (const size of scaledSizes) total.add(size);
        remainingTotal = total.value;
        let exactTotal: bigint | undefined;
        const certaintyThisRound = activeIndices.filter((index, position) => {
            // With positive masses and more than one unit, n=1 cannot have
            // a certainty unit, even if its floating-point probability equals one.
            if (remainingSampleSize === 1) return false;
            const scaledTarget = remainingSampleSize * scaledSizes[position]!;
            const difference = scaledTarget - remainingTotal;
            const roundingBound = 16 * Number.EPSILON * Math.max(scaledTarget, remainingTotal);
            if (Math.abs(difference) > roundingBound) return difference > 0;
            exactTotal ??= activeIndices.reduce((sum, id) => sum + exactPositiveMass(sizes[id]!), 0n);
            return BigInt(remainingSampleSize) * exactPositiveMass(sizes[index]!) >= exactTotal;
        });

        if (certaintyThisRound.length === 0) break;

        for (const index of certaintyThisRound) {
            certaintyIndices.push(index);
            certaintyProbabilities.push(1);
        }

        const certaintySet = new Set(certaintyThisRound);
        activeIndices = activeIndices.filter((index) => !certaintySet.has(index));
        remainingSampleSize -= certaintyThisRound.length;

        if (activeIndices.length < remainingSampleSize || (remainingSampleSize === 0 && activeIndices.length > 0)) {
            return null;
        }
    }

    if (remainingSampleSize === 0) {
        return {
            certaintyIndices,
            certaintyProbabilities,
            systematicIndices: [],
            systematicProbabilities: [],
            systematicSampleSize: 0,
        };
    }

    if (remainingTotal <= 0) {
        return null;
    }

    const systematicIndices = [...activeIndices];
    const systematicProbabilities = scaledSizes.map(size =>
        (remainingSampleSize / remainingTotal) * size
    );
    // A non-certainty unit must retain a representable probability strictly
    // between zero and one. Never silently turn an unresolved design into a
    // deterministic frame (and hence a false zero standard error).
    if (systematicProbabilities.some(p => !Number.isFinite(p) || p <= 0 || p >= 1)) return null;
    // A positive subnormal can still have severe relative error. Check both
    // normalization and probability multiplication, only on the final frame:
    // tiny masses may legitimately recover after a certainty unit is removed.
    const probabilityFactor = remainingSampleSize / remainingTotal;
    for (let position = 0; position < systematicIndices.length; position++) {
        const size = sizes[systematicIndices[position]!]!;
        const scaled = scaledSizes[position]!;
        const recoveredSizeRatio = scaled * scale / size;
        const recoveredFactorRatio = (systematicProbabilities[position]! / scaled) / probabilityFactor;
        if (!Number.isFinite(recoveredSizeRatio) || !Number.isFinite(recoveredFactorRatio)
            || Math.abs(recoveredSizeRatio - 1) > 1e-6 || Math.abs(recoveredFactorRatio - 1) > 1e-6) return null;
    }

    return {
        certaintyIndices,
        certaintyProbabilities,
        systematicIndices,
        systematicProbabilities,
        systematicSampleSize: remainingSampleSize,
    };
}

function selectFixedPiSystematicSample(
    indices: number[],
    inclusionProbabilities: number[],
    randomStart: number,
) {
    const selectedIndices: number[] = [];
    const selectedProbabilities: number[] = [];
    let cumulativeProbability = 0;
    let thresholdIndex = 0;
    const targetSampleSize = Math.round(
        inclusionProbabilities.reduce((sum, probability) => sum + probability, 0)
    );

    for (let position = 0; position < indices.length && thresholdIndex < targetSampleSize; position += 1) {
        const index = indices[position]!;
        const probability = inclusionProbabilities[position]!;
        const nextCumulativeProbability = position === indices.length - 1
            ? targetSampleSize : cumulativeProbability + probability;
        const threshold = randomStart + thresholdIndex;

        if (
            threshold >= cumulativeProbability
            && threshold < nextCumulativeProbability
        ) {
            selectedIndices.push(index);
            selectedProbabilities.push(probability);
            thresholdIndex += 1;
        }

        cumulativeProbability = nextCumulativeProbability;
    }

    return { selectedIndices, selectedProbabilities };
}

export function preparePPSSampling(
    data: any[],
    sizeField: string,
    n: number,
): PreparedPPSSampling<any> | null {
    if (data.length === 0 || n <= 0 || !sizeField) {
        return null;
    }

    const sampleSize = Math.min(Math.floor(n), data.length);
    const sizes = data.map((item) => toPositiveSizeValue(item[sizeField]));
    const designFrame = buildPpsWithoutReplacementDesign(sizes, sampleSize);

    if (!designFrame) {
        return null;
    }

    return {
        data,
        sampleSize,
        designFrame,
    };
}

export function drawPreparedPPSSample(
    prepared: PreparedPPSSampling<any>,
    random: () => number,
): PPSSamplingResult<any> {
    const randomStart = prepared.designFrame.systematicSampleSize > 0 ? random() : 0;
    const systematicSelection = prepared.designFrame.systematicSampleSize > 0
        ? selectFixedPiSystematicSample(
            prepared.designFrame.systematicIndices,
            prepared.designFrame.systematicProbabilities,
            randomStart,
        )
        : { selectedIndices: [], selectedProbabilities: [] };

    const combined = [
        ...prepared.designFrame.certaintyIndices.map((index, position) => ({
            index,
            inclusionProbability: prepared.designFrame.certaintyProbabilities[position]!,
        })),
        ...systematicSelection.selectedIndices.map((index, position) => ({
            index,
            inclusionProbability: systematicSelection.selectedProbabilities[position]!,
        })),
    ].sort((left, right) => left.index - right.index);
    const frameProbabilities = [
        ...prepared.designFrame.certaintyProbabilities,
        ...prepared.designFrame.systematicProbabilities,
    ];
    let probabilitySum = 0;
    let minInclusionProbability = Number.POSITIVE_INFINITY;
    let maxInclusionProbability = 0;
    for (const probability of frameProbabilities) {
        probabilitySum += probability;
        minInclusionProbability = Math.min(minInclusionProbability, probability);
        maxInclusionProbability = Math.max(maxInclusionProbability, probability);
    }

    return {
        data: combined.map((entry) => prepared.data[entry.index]),
        indices: combined.map((entry) => entry.index),
        inclusionProbabilities: combined.map((entry) => entry.inclusionProbability),
        randomStart,
        probabilitySummary: {
            populationCount: prepared.data.length,
            probabilitySum,
            minInclusionProbability,
            maxInclusionProbability,
            certaintyUnitCount: prepared.designFrame.certaintyIndices.length,
        },
    };
}

/**
 * PPS (Probability Proportional to Size) sampling without replacement.
 *
 * Uses fixed-size systematic PPS on first-order inclusion probabilities.
 * Certainty units (πᵢ ≥ 1) are selected first; the remaining units are sampled
 * by a single random start on cumulative inclusion probabilities.
 */
export function performPPSSampling(
    data: any[],
    sizeField: string,
    n: number,
    random: () => number,
): PPSSamplingResult<any> {
    const prepared = preparePPSSampling(data, sizeField, n);
    if (!prepared) {
        return {
            data: [],
            indices: [],
            inclusionProbabilities: [],
            randomStart: 0,
        };
    }

    return drawPreparedPPSSample(prepared, random);
}
