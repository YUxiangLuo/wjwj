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

export function performSimpleSampling(data: any[], n: number, random: () => number): any[] {
    const sampleSize = Math.max(0, Math.min(Number(n) || 0, data.length));
    // Partial Fisher-Yates: only shuffle the last `sampleSize` positions — O(n) instead of O(N)
    const indices = Array.from({ length: data.length }, (_, i) => i);

    for (let i = indices.length - 1; i >= indices.length - sampleSize && i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const temp = indices[i]!;
        indices[i] = indices[j]!;
        indices[j] = temp;
    }

    const selectedIndices = indices.slice(indices.length - sampleSize);
    return selectedIndices.map((i) => data[i]);
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

export function performStratifiedSampling(data: any[], stratifyBy: string, layers: any[], random: () => number): any[] {
    const result: any[] = [];
    const groups: Record<string, any[]> = {};
    for (const item of data) {
        const val = String(item[stratifyBy]);
        if (!groups[val]) groups[val] = [];
        groups[val].push(item);
    }

    for (const layer of layers) {
        const groupData = groups[layer.name] || [];
        const sampleCount = layer.sampleCount;

        if (sampleCount > 0 && groupData.length > 0) {
            const sampled = performSimpleSampling(groupData, sampleCount, random);
            result.push(...sampled);
        }
    }

    return result;
}

export interface PPSSamplingResult<T> {
    data: T[];
    indices: number[];
    inclusionProbabilities: number[];
    randomStart: number;
}

export interface PreparedPPSSampling<T> {
    data: T[];
    sampleSize: number;
    designFrame: PpsDesignFrame;
}

const PPS_EPSILON = 1e-9;

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
    let remainingTotal = activeIndices.reduce((sum, index) => sum + sizes[index]!, 0);
    const certaintyIndices: number[] = [];
    const certaintyProbabilities: number[] = [];

    while (remainingSampleSize > 0 && activeIndices.length > 0) {
        const certaintyThisRound = activeIndices.filter((index) =>
            remainingTotal > 0 && (remainingSampleSize * sizes[index]! / remainingTotal) >= 1 - PPS_EPSILON
        );

        if (certaintyThisRound.length === 0) {
            break;
        }

        for (const index of certaintyThisRound) {
            certaintyIndices.push(index);
            certaintyProbabilities.push(1);
        }

        const certaintySet = new Set(certaintyThisRound);
        activeIndices = activeIndices.filter((index) => !certaintySet.has(index));
        remainingSampleSize -= certaintyThisRound.length;
        remainingTotal -= certaintyThisRound.reduce((sum, index) => sum + sizes[index]!, 0);

        if (activeIndices.length < remainingSampleSize) {
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
    const systematicProbabilities = systematicIndices.map((index) =>
        remainingSampleSize * sizes[index]! / remainingTotal
    );

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
        const nextCumulativeProbability = cumulativeProbability + probability;
        const threshold = randomStart + thresholdIndex;

        if (
            threshold + PPS_EPSILON >= cumulativeProbability
            && threshold < nextCumulativeProbability - PPS_EPSILON
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

    return {
        data: combined.map((entry) => prepared.data[entry.index]),
        indices: combined.map((entry) => entry.index),
        inclusionProbabilities: combined.map((entry) => entry.inclusionProbability),
        randomStart,
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
