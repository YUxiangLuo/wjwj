import { toTrimmedCategory, type NumericAccessor, fieldAccessor } from "./values";
import { createSafeRecord } from "../../lib/safe-record";
import { createSeededRandom, drawPreparedPPSSample, preparePPSSampling } from "./sampling";

export const DEFAULT_PPS_MONTE_CARLO_REPLICATES = 512;

/** 教学环境可调整重复次数；设置边界避免误配置导致无意义结果或过量计算。 */
export function resolvePpsMonteCarloReplicates(rawValue?: string): number {
    if (rawValue == null || rawValue.trim() === "") return DEFAULT_PPS_MONTE_CARLO_REPLICATES;
    const parsed = Number(rawValue);
    return Number.isInteger(parsed) && parsed >= 32 && parsed <= 1024
        ? parsed
        : DEFAULT_PPS_MONTE_CARLO_REPLICATES;
}

export interface PpsStandardErrorContext {
    standardErrors: Record<string, number | null>;
    mode: "monte_carlo" | "census_exact";
    replicateCount: number;
}

const PPS_CONTEXT_CACHE_MAX_ENTRIES_PER_POPULATION = 16;

const ppsStandardErrorContextCache = new WeakMap<
    Array<Record<string, unknown>>,
    Map<string, PpsStandardErrorContext>
>();

function ppsContextCacheKey(
    sizeField: string,
    sampleSize: number,
    fieldKeys: string[],
    replicateCount: number,
) {
    return JSON.stringify([sizeField, sampleSize, fieldKeys, replicateCount]);
}

function getCachedPpsStandardErrorContext(
    population: Array<Record<string, unknown>>,
    key: string,
) {
    const populationCache = ppsStandardErrorContextCache.get(population);
    const cached = populationCache?.get(key);
    if (!cached || !populationCache) return null;

    // Refresh insertion order so the small per-population map behaves as LRU.
    populationCache.delete(key);
    populationCache.set(key, cached);
    return cached;
}

function cachePpsStandardErrorContext(
    population: Array<Record<string, unknown>>,
    key: string,
    context: PpsStandardErrorContext,
) {
    const populationCache = ppsStandardErrorContextCache.get(population) ?? new Map<string, PpsStandardErrorContext>();
    populationCache.set(key, context);
    while (populationCache.size > PPS_CONTEXT_CACHE_MAX_ENTRIES_PER_POPULATION) {
        const oldestKey = populationCache.keys().next().value;
        if (oldestKey === undefined) break;
        populationCache.delete(oldestKey);
    }
    ppsStandardErrorContextCache.set(population, populationCache);
    return context;
}

/** Hájek 比估计：Σ (y_i/π_i) / Σ (1/π_i)，不是 (1/N) Σ (y_i/π_i) 的 HT 均值。 */
export function estimateWeightedValue(
    rows: Array<Record<string, unknown>>,
    accessor: NumericAccessor,
    inclusionProbabilities: number[] | undefined,
) {
    if (!Array.isArray(inclusionProbabilities) || inclusionProbabilities.length !== rows.length) {
        return null;
    }

    let weightedSum = 0;
    let totalWeight = 0;

    for (let index = 0; index < rows.length; index += 1) {
        const value = accessor(rows[index]!);
        const inclusionProbability = Number(inclusionProbabilities[index]);
        if (value === null || !Number.isFinite(inclusionProbability) || inclusionProbability <= 0) {
            continue;
        }
        const weight = 1 / inclusionProbability;
        weightedSum += weight * value;
        totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : null;
}

export function estimateWeightedMean(
    rows: Array<Record<string, unknown>>,
    field: string,
    inclusionProbabilities: number[] | undefined,
) {
    return estimateWeightedValue(rows, fieldAccessor(field), inclusionProbabilities);
}

export function estimateWeightedDistribution(
    rows: Array<Record<string, unknown>>,
    field: string,
    inclusionProbabilities: number[] | undefined,
) {
    if (!Array.isArray(inclusionProbabilities) || inclusionProbabilities.length !== rows.length) {
        return {};
    }

    const counts = createSafeRecord<number>();
    let totalWeight = 0;

    for (let index = 0; index < rows.length; index += 1) {
        const category = toTrimmedCategory(rows[index]?.[field]) ?? "（缺失值）";
        const inclusionProbability = Number(inclusionProbabilities[index]);
        if (!Number.isFinite(inclusionProbability) || inclusionProbability <= 0) {
            continue;
        }
        const weight = 1 / inclusionProbability;
        counts[category] = (counts[category] || 0) + weight;
        totalWeight += weight;
    }

    if (totalWeight <= 0) return {};

    return Object.fromEntries(
        Object.entries(counts).map(([category, weightedCount]) => [category, weightedCount / totalWeight * 100])
    );
}

export function buildPpsStandardErrorContext(
    population: Array<Record<string, unknown>>,
    sizeField: string | undefined,
    sampleSize: number | undefined,
    fields: Array<{ key: string; accessor: NumericAccessor }>,
    replicateCount: number,
): PpsStandardErrorContext | null {
    const normalizedSampleSize = Number(sampleSize);
    if (!sizeField || !Number.isInteger(normalizedSampleSize) || normalizedSampleSize < 1 || fields.length === 0) {
        return null;
    }

    const cacheKey = ppsContextCacheKey(sizeField, normalizedSampleSize, fields.map((field) => field.key), replicateCount);
    const cached = getCachedPpsStandardErrorContext(population, cacheKey);
    if (cached) return cached;

    const prepared = preparePPSSampling(population, sizeField, normalizedSampleSize);
    if (!prepared) {
        return null;
    }

    // A valid census contains every unit with inclusion probability one, so its
    // design distribution is degenerate. Repeating the identical draw hundreds
    // of times only blocks the single Bun process and cannot change the SE.
    if (normalizedSampleSize === population.length) {
        return cachePpsStandardErrorContext(population, cacheKey, {
            standardErrors: Object.fromEntries(fields.map((field) => [field.key, 0])),
            mode: "census_exact",
            replicateCount: 0,
        });
    }

    // Welford accumulators keep memory at O(number of numeric fields) instead
    // of retaining every complete PPS sample at once.
    const accumulators = Object.fromEntries(fields.map((field) => [field.key, {
        count: 0,
        mean: 0,
        squaredDeviation: 0,
    }]));

    let successfulReplicateCount = 0;
    for (let iteration = 0; iteration < replicateCount; iteration += 1) {
        const replicate = drawPreparedPPSSample(
            prepared,
            createSeededRandom(`analysis-pps-${iteration}`),
        );
        if (replicate.data.length !== normalizedSampleSize) continue;
        successfulReplicateCount += 1;

        for (const field of fields) {
            const estimate = estimateWeightedValue(
                replicate.data,
                field.accessor,
                replicate.inclusionProbabilities,
            );
            if (estimate === null) continue;

            const accumulator = accumulators[field.key]!;
            accumulator.count += 1;
            const delta = estimate - accumulator.mean;
            accumulator.mean += delta / accumulator.count;
            accumulator.squaredDeviation += delta * (estimate - accumulator.mean);
        }
    }

    const standardErrors = Object.fromEntries(fields.map((field) => {
        const accumulator = accumulators[field.key]!;
        return [
            field.key,
            accumulator.count > 1
                // 重复抽样结果用于估计设计分布的标准差，采用 Bessel 校正 R−1。
                ? Math.sqrt(Math.max(0, accumulator.squaredDeviation / (accumulator.count - 1)))
                : null,
        ];
    }));
    return cachePpsStandardErrorContext(population, cacheKey, {
        standardErrors,
        mode: "monte_carlo",
        replicateCount: successfulReplicateCount,
    });
}

export function computePpsMeanSe(
    field: string,
    context: PpsStandardErrorContext | null,
) {
    return context?.standardErrors[field] ?? null;
}
