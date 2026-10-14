import { toTrimmedCategory, type NumericAccessor, fieldAccessor } from "./values";
import { createSafeRecord } from "../../lib/safe-record";
import { preparePPSSampling } from "./sampling";
import { exactPpsStandardErrors } from "./pps-exact";
import { StableSum } from "./stable-sum";

export interface PpsStandardErrorContext {
    standardErrors: Record<string, number | null>;
    mode: "systematic_exact" | "census_exact";
    replicateCount: number;
}

/** Keep the exact 1/π meaning visible even when its numeric reciprocal overflows. */
export function inverseProbabilityWeightForDisplay(probability: number): number | string {
    const weight = 1 / probability;
    return Number.isFinite(weight) ? weight : `1/${probability}`;
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
) {
    return JSON.stringify([sizeField, sampleSize, fieldKeys]);
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

    const valid: Array<{ value: number; probability: number }> = [];

    for (let index = 0; index < rows.length; index += 1) {
        const value = accessor(rows[index]!);
        const inclusionProbability = Number(inclusionProbabilities[index]);
        if (value === null || !Number.isFinite(inclusionProbability) || inclusionProbability <= 0) {
            continue;
        }
        valid.push({ value, probability: inclusionProbability });
    }

    if (valid.length === 0) return null;
    const valueScale = valid.reduce((maximum, item) => Math.max(maximum, Math.abs(item.value)), 0);
    if (valueScale === 0) return 0;
    const minimumProbability = valid.reduce((minimum, item) => Math.min(minimum, item.probability), Infinity);
    const numerator = new StableSum();
    const unscaledNumerator = new StableSum();
    const denominator = new StableSum();
    let productUnderflow = false;
    for (const item of valid) {
        // min(π)/π is proportional to 1/π without overflowing for tiny π.
        const normalizedWeight = minimumProbability / item.probability;
        const product = normalizedWeight * item.value;
        // Subnormal products lose precision even when they do not round to zero.
        if (item.value !== 0 && normalizedWeight > 0 && Math.abs(product) < 2 ** -1022) productUnderflow = true;
        unscaledNumerator.add(product);
        numerator.add(normalizedWeight * (item.value / valueScale));
        denominator.add(normalizedWeight);
    }
    // Preserve cancellation residuals unless original-unit products/sums lose range.
    if (denominator.value > 0 && !productUnderflow && Number.isFinite(unscaledNumerator.value)) return unscaledNumerator.value / denominator.value;
    return denominator.value > 0 ? (numerator.value / denominator.value) * valueScale : null;
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

    const validProbabilities = inclusionProbabilities
        .map(Number)
        .filter(probability => Number.isFinite(probability) && probability > 0);
    if (validProbabilities.length === 0) return {};

    const minimumProbability = validProbabilities.reduce(
        (minimum, probability) => Math.min(minimum, probability),
        Infinity,
    );
    const counts = createSafeRecord<StableSum>();
    const totalWeight = new StableSum();

    for (let index = 0; index < rows.length; index += 1) {
        const category = toTrimmedCategory(rows[index]?.[field]) ?? "（缺失值）";
        const inclusionProbability = Number(inclusionProbabilities[index]);
        if (!Number.isFinite(inclusionProbability) || inclusionProbability <= 0) {
            continue;
        }
        // min(π)/π is proportional to 1/π, but cannot overflow when a valid
        // inclusion probability is too small for its reciprocal to be finite.
        const weight = minimumProbability / inclusionProbability;
        (counts[category] ??= new StableSum()).add(weight);
        totalWeight.add(weight);
    }

    if (totalWeight.value <= 0) return {};

    return Object.fromEntries(
        Object.entries(counts).map(([category, weightedCount]) => [category, weightedCount.value / totalWeight.value * 100])
    );
}

export function buildPpsStandardErrorContext(
    population: Array<Record<string, unknown>>,
    sizeField: string | undefined,
    sampleSize: number | undefined,
    fields: Array<{ key: string; accessor: NumericAccessor }>,
    _legacyReplicateCount: number,
): PpsStandardErrorContext | null {
    const normalizedSampleSize = Number(sampleSize);
    if (!sizeField || !Number.isInteger(normalizedSampleSize) || normalizedSampleSize < 1 || fields.length === 0) {
        return null;
    }

    const cacheKey = ppsContextCacheKey(sizeField, normalizedSampleSize, fields.map((field) => field.key));
    const cached = getCachedPpsStandardErrorContext(population, cacheKey);
    if (cached) return cached;

    const sizeAccessor = fieldAccessor(sizeField);
    if (population.some(row => { const size = sizeAccessor(row); return size === null || size <= 0; })) return null;

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

    return cachePpsStandardErrorContext(population, cacheKey, {
        standardErrors: exactPpsStandardErrors(prepared, fields),
        mode: "systematic_exact",
        replicateCount: 0,
    });
}

export function computePpsMeanSe(
    field: string,
    context: PpsStandardErrorContext | null,
) {
    return context?.standardErrors[field] ?? null;
}
