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
    return String(value).trim();
}

export function performStratifiedSamplingWithIndices<T extends Record<string, unknown>>(
    data: T[],
    stratifyBy: string,
    layers: Array<{ name: unknown; sampleCount: number }>,
    random: () => number,
) {
    const result: T[] = [];
    const selectedIndices: number[] = [];
    const groups: Record<string, Array<{ row: T; index: number }>> = {};
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
    systematicCumulativeProbabilities: number[];
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
            systematicCumulativeProbabilities: [],
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
    let cumulative = 0;
    const systematicCumulativeProbabilities = systematicProbabilities.map((probability) => {
        cumulative += probability;
        return cumulative;
    });

    return {
        certaintyIndices,
        certaintyProbabilities,
        systematicIndices,
        systematicProbabilities,
        systematicCumulativeProbabilities,
        systematicSampleSize: remainingSampleSize,
    };
}

function selectFixedPiSystematicSample(
    indices: number[],
    inclusionProbabilities: number[],
    cumulativeProbabilities: number[],
    randomStart: number,
) {
    const selectedIndices: number[] = [];
    const selectedProbabilities: number[] = [];
    const targetSampleSize = Math.round(
        inclusionProbabilities.reduce((sum, probability) => sum + probability, 0)
    );

    for (let thresholdIndex = 0; thresholdIndex < targetSampleSize; thresholdIndex += 1) {
        const threshold = randomStart + thresholdIndex;
        let low = 0;
        let high = cumulativeProbabilities.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (cumulativeProbabilities[middle]! > threshold + PPS_EPSILON) high = middle;
            else low = middle + 1;
        }
        if (low >= indices.length) continue;
        selectedIndices.push(indices[low]!);
        selectedProbabilities.push(inclusionProbabilities[low]!);
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
            prepared.designFrame.systematicCumulativeProbabilities,
            randomStart,
        )
        : { selectedIndices: [], selectedProbabilities: [] };

    const certaintyEntries = prepared.designFrame.certaintyIndices.map((index, position) => ({
            index,
            inclusionProbability: prepared.designFrame.certaintyProbabilities[position]!,
        }));
    const systematicEntries = systematicSelection.selectedIndices.map((index, position) => ({
            index,
            inclusionProbability: systematicSelection.selectedProbabilities[position]!,
        }));
    const combined: Array<{ index: number; inclusionProbability: number }> = [];
    let certaintyPosition = 0;
    let systematicPosition = 0;
    while (certaintyPosition < certaintyEntries.length || systematicPosition < systematicEntries.length) {
        const certainty = certaintyEntries[certaintyPosition];
        const systematic = systematicEntries[systematicPosition];
        if (systematic === undefined || (certainty !== undefined && certainty.index < systematic.index)) {
            combined.push(certainty!);
            certaintyPosition += 1;
        } else {
            combined.push(systematic);
            systematicPosition += 1;
        }
    }

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
