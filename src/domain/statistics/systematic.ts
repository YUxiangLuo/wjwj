import { type NumericAccessor, fieldAccessor, sampleStandardDeviation, scaledMean } from "./values";
import type { SamplingResultsData } from "../experiment/types";
import { StableSum } from "./stable-sum";

function normalizePopulationValues(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
): { kind: "empty" } | { kind: "constant" } | { kind: "scaled"; scale: number; values: Array<number | null> } {
    const rawValues = population.map(accessor);
    let min = Infinity;
    let max = -Infinity;
    for (const value of rawValues) {
        if (value === null) continue;
        if (!Number.isFinite(value)) return { kind: "empty" };
        if (value < min) min = value;
        if (value > max) max = value;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return { kind: "empty" };

    // Overflow-safe midrange centering preserves small differences on large
    // translations and avoids +/-Infinity when opposite-sign extremes reach 1e308.
    const origin = min / 2 + max / 2;
    let scale = 0;
    for (const value of rawValues) {
        if (value === null) continue;
        const absDeviation = Math.abs(value - origin);
        if (absDeviation > scale) scale = absDeviation;
    }
    if (!Number.isFinite(scale)) return { kind: "empty" };
    if (scale === 0) return { kind: "constant" };

    const values = rawValues.map((value) => (value === null ? null : (value - origin) / scale));
    return { kind: "scaled", scale, values };
}

function computeLegacySystematicValueSe(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    kValue: number,
) {
    if (!Number.isInteger(kValue) || kValue < 1 || population.length === 0) return null;

    const normalized = normalizePopulationValues(population, accessor);
    if (normalized.kind === "empty") return null;
    if (normalized.kind === "constant") return 0;

    const startMeans: number[] = [];
    for (let startIndex = 0; startIndex < kValue; startIndex += 1) {
        const values: number[] = [];
        for (let index = startIndex; index < population.length; index += kValue) {
            const value = normalized.values[index]!;
            if (value !== null) {
                values.push(value);
            }
        }
        if (values.length === 0) continue;
        startMeans.push(scaledMean(values)!);
    }

    if (startMeans.length === 0) return null;
    if (startMeans.length === 1) return 0;

    const scaledSe = sampleStandardDeviation(startMeans) / Math.sqrt(startMeans.length / (startMeans.length - 1));
    const se = scaledSe * normalized.scale;
    return Number.isFinite(se) && (scaledSe === 0 || se > 0) ? se : null;
}

function computeFractionalSystematicValueSe(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    interval: number,
    sampleSize: number,
) {
    const populationSize = population.length;
    if (
        !Number.isFinite(interval)
        || interval < 1
        || !Number.isInteger(sampleSize)
        || sampleSize < 1
        || sampleSize > populationSize
    ) {
        return null;
    }

    const expectedInterval = populationSize / sampleSize;
    const tolerance = Number.EPSILON * Math.max(1, populationSize, interval) * 64;
    if (Math.abs(interval - expectedInterval) > tolerance) {
        return null;
    }

    const normalized = normalizePopulationValues(population, accessor);
    if (normalized.kind === "empty") return null;
    if (normalized.kind === "constant") return 0;

    // For r uniform on [0, K), a selected index changes only when
    // r + jK crosses an integer. Sweep those boundaries so the exact design
    // variance stays O(N log N), including for large uploaded populations.
    const events: Array<{ position: number; sampleIndex: number }> = [];
    for (let sampleIndex = 0; sampleIndex < sampleSize; sampleIndex += 1) {
        const offset = sampleIndex * interval;
        const upperBoundary = offset + interval;
        for (
            let integerBoundary = Math.floor(offset) + 1;
            integerBoundary < upperBoundary;
            integerBoundary += 1
        ) {
            const position = integerBoundary - offset;
            if (position > tolerance && position < interval - tolerance) {
                events.push({ position, sampleIndex });
            }
        }
    }
    events.sort((left, right) => left.position - right.position);

    const firstBoundary = events[0]?.position ?? interval;
    const initialStart = firstBoundary / 2;
    const selectedIndices = Array.from(
        { length: sampleSize },
        (_, sampleIndex) => Math.floor(initialStart + sampleIndex * interval),
    );

    const valueSum = new StableSum();
    let valueCount = 0;
    for (const selectedIndex of selectedIndices) {
        const value = normalized.values[selectedIndex]!;
        if (value !== null) {
            valueSum.add(value);
            valueCount += 1;
        }
    }

    let totalWeight = 0;
    let weightedMean = 0;
    let weightedDeviationNorm = 0;
    const includeSegment = (width: number) => {
        if (width <= tolerance || valueCount === 0) return;
        const weight = width / interval;
        const segmentMean = valueSum.value / valueCount;
        const nextTotalWeight = totalWeight + weight;
        const delta = segmentMean - weightedMean;
        // Weighted Welford increment, accumulated without squaring tiny deviations.
        weightedDeviationNorm = Math.hypot(weightedDeviationNorm, delta * Math.sqrt(weight * totalWeight / nextTotalWeight));
        weightedMean += delta * weight / nextTotalWeight;
        totalWeight = nextTotalWeight;
    };

    let segmentStart = 0;
    let eventIndex = 0;
    while (eventIndex < events.length) {
        const boundary = events[eventIndex]!.position;
        includeSegment(boundary - segmentStart);

        let groupEnd = eventIndex;
        while (
            groupEnd < events.length
            && Math.abs(events[groupEnd]!.position - boundary) <= tolerance
        ) {
            const sampleIndex = events[groupEnd]!.sampleIndex;
            const previousIndex = selectedIndices[sampleIndex]!;
            const nextIndex = previousIndex + 1;
            if (nextIndex >= populationSize) return null;

            const previousValue = normalized.values[previousIndex]!;
            if (previousValue !== null) {
                valueSum.add(-previousValue);
                valueCount -= 1;
            }
            const nextValue = normalized.values[nextIndex]!;
            if (nextValue !== null) {
                valueSum.add(nextValue);
                valueCount += 1;
            }
            selectedIndices[sampleIndex] = nextIndex;
            groupEnd += 1;
        }

        segmentStart = boundary;
        eventIndex = groupEnd;
    }
    includeSegment(interval - segmentStart);

    if (totalWeight === 0) return null;
    const scaledSe = weightedDeviationNorm / Math.sqrt(totalWeight);
    const se = scaledSe * normalized.scale;
    return Number.isFinite(se) && (scaledSe === 0 || se > 0) ? se : null;
}

export function computeSystematicExactMeanSe(
    population: Array<Record<string, unknown>>,
    field: string,
    design: SamplingResultsData["systematic"] | undefined,
) {
    return computeSystematicExactValueSe(population, fieldAccessor(field), design);
}

export function computeSystematicExactValueSe(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    design: SamplingResultsData["systematic"] | undefined,
) {
    const interval = Number(design?.interval);
    const sampleSize = Number(design?.sampleCount);
    if (Number.isFinite(interval) && Number.isInteger(sampleSize)) {
        return computeFractionalSystematicValueSe(population, accessor, interval, sampleSize);
    }

    return computeLegacySystematicValueSe(population, accessor, Number(design?.kValue));
}
