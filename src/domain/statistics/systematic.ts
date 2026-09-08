import { type NumericAccessor, fieldAccessor } from "./values";
import type { SamplingResultsData } from "../experiment/types";
import { StableSum } from "./stable-sum";

function computeLegacySystematicValueSe(
    population: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    kValue: number,
) {
    if (!Number.isInteger(kValue) || kValue < 1 || population.length === 0) return null;

    const origin = population.map(accessor).find(value => value !== null) ?? 0;
    const startMeans: number[] = [];
    for (let startIndex = 0; startIndex < kValue; startIndex += 1) {
        const values: number[] = [];
        for (let index = startIndex; index < population.length; index += kValue) {
            const value = accessor(population[index]!);
            if (value !== null) {
                values.push(value - origin);
            }
        }
        if (values.length === 0) continue;
        startMeans.push(values.reduce((sum, value) => sum + value, 0) / values.length);
    }

    if (startMeans.length === 0) return null;

    const meanEstimate = startMeans.reduce((sum, value) => sum + value, 0) / startMeans.length;
    const variance = startMeans.reduce((sum, value) => sum + (value - meanEstimate) ** 2, 0) / startMeans.length;
    return Math.sqrt(variance);
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

    const origin = population.map(accessor).find(value => value !== null) ?? 0;
    const valueSum = new StableSum();
    let valueCount = 0;
    for (const selectedIndex of selectedIndices) {
        const value = accessor(population[selectedIndex]!);
        if (value !== null) {
            valueSum.add(value - origin);
            valueCount += 1;
        }
    }

    let totalWeight = 0;
    let weightedMean = 0;
    let weightedSquaredDeviation = 0;
    const includeSegment = (width: number) => {
        if (width <= tolerance || valueCount === 0) return;
        const weight = width / interval;
        const segmentMean = valueSum.value / valueCount;
        const nextTotalWeight = totalWeight + weight;
        const delta = segmentMean - weightedMean;
        weightedMean += delta * weight / nextTotalWeight;
        weightedSquaredDeviation += weight * delta * (segmentMean - weightedMean);
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

            const previousValue = accessor(population[previousIndex]!);
            if (previousValue !== null) {
                valueSum.add(-(previousValue - origin));
                valueCount -= 1;
            }
            const nextValue = accessor(population[nextIndex]!);
            if (nextValue !== null) {
                valueSum.add(nextValue - origin);
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
    return Math.sqrt(Math.max(0, weightedSquaredDeviation / totalWeight));
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
