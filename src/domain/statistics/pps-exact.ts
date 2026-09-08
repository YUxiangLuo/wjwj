import type { PreparedPPSSampling } from "./sampling";
import type { NumericAccessor } from "./values";
import { StableSum } from "./stable-sum";

/**
 * Integrate the Hájek estimator over every random-start interval of the fixed-π
 * systematic design. At a cumulative probability boundary, one selected unit
 * changes to its successor. O(N log N + N × fields), without rare-event simulation.
 */
export function exactPpsStandardErrors(
    prepared: PreparedPPSSampling<Record<string, unknown>>,
    fields: Array<{ key: string; accessor: NumericAccessor }>,
): Record<string, number | null> {
    const { data, designFrame: frame } = prepared;
    const unavailable = () => Object.fromEntries(fields.map(field => [field.key, null]));
    const probabilities = frame.systematicProbabilities;
    let minProbability = 1;
    for (const probability of probabilities) minProbability = Math.min(minProbability, probability);
    if (!(minProbability > 0)) return unavailable();

    const weights = new Float64Array(data.length);
    for (const index of frame.certaintyIndices) weights[index] = minProbability;
    frame.systematicIndices.forEach((index, position) => {
        weights[index] = minProbability / probabilities[position]!;
    });
    const selected = [...frame.certaintyIndices];
    const events: Array<{ position: number; previous: number; next: number }> = [];
    let cumulative = 0;
    for (let position = 0; position < probabilities.length; position++) {
        const probability = probabilities[position]!;
        const upper = position === probabilities.length - 1 ? frame.systematicSampleSize : cumulative + probability;
        // Floating-point resolution must be sufficient to locate this unit's
        // interval. Do not report a spuriously precise result after losing it.
        if (!Number.isFinite(upper) || Math.abs((upper - cumulative) - probability) > probability * 1e-6) return unavailable();
        const index = frame.systematicIndices[position]!;
        if (Math.ceil(cumulative) < upper) selected.push(index);
        const boundary = upper - Math.floor(upper);
        if (position + 1 < probabilities.length && boundary > 0) {
            events.push({ position: boundary, previous: index, next: frame.systematicIndices[position + 1]! });
        }
        cumulative = upper;
    }
    // Match the right-hand limit at start zero, excluding a numerical endpoint
    // just above the integer total probability.
    if (selected.length !== prepared.sampleSize) return unavailable();
    events.sort((left, right) => left.position - right.position);

    const denominator = new StableSum();
    selected.forEach(index => denominator.add(weights[index]!));
    const accumulators = fields.map(field => {
        const raw = data.map(field.accessor);
        const origin = raw[0] ?? 0;
        const values = raw.map(value => value === null ? NaN : value - origin);
        let valid = values.every(Number.isFinite);
        let scale = 0;
        for (const value of values) scale = Math.max(scale, Math.abs(value));
        scale = scale || 1;
        // Weight scaling alone can erase y * weight even when SE and SE² are
        // representable. Integrate in scaled, centered value units and restore
        // the field's units only after taking the standard deviation.
        const weightedValues = values.map((value, index) => {
            const weight = weights[index]!;
            // A frame containing only certainty units has no random component;
            // units outside that deterministic sample carry no estimator weight.
            if (weight === 0) return 0;
            const product = (value / scale) * weight;
            // Reject loss of a nonzero contribution (including severe subnormal
            // rounding). Neither compensated sums nor hypot can recover it.
            const recovered = product / weight * scale;
            if (!Number.isFinite(product) || !Number.isFinite(recovered)
                || (value !== 0 && Math.abs(recovered / value - 1) > 1e-6)) valid = false;
            return product;
        });
        const numerator = new StableSum();
        if (valid) selected.forEach(index => numerator.add(weightedValues[index]!));
        return { key: field.key, weightedValues, scale, valid, numerator, mean: 0, rootM2: 0 };
    });

    let totalWeight = 0;
    const include = (width: number) => {
        if (!(width > 0)) return;
        const nextWeight = totalWeight + width;
        for (const accumulator of accumulators) {
            if (!accumulator.valid) continue;
            const estimate = accumulator.numerator.value / denominator.value;
            if (!Number.isFinite(estimate) || !(denominator.value > 0)) {
                accumulator.valid = false;
                continue;
            }
            const delta = estimate - accumulator.mean;
            // A rare first interval can be many orders of magnitude shorter
            // than the next. Subtracting the updated mean from the estimate
            // would erase its variance when width / nextWeight rounds to one.
            const scaledDelta = delta * Math.sqrt(totalWeight / nextWeight) * Math.sqrt(width);
            if (delta !== 0 && totalWeight > 0 && scaledDelta === 0) {
                accumulator.valid = false;
                continue;
            }
            // Store sqrt(M2): the standard error can be representable even when
            // its square underflows. hypot scales its arguments before squaring.
            accumulator.rootM2 = Math.hypot(accumulator.rootM2, scaledDelta);
            accumulator.mean = totalWeight >= width
                ? accumulator.mean + delta * (width / nextWeight)
                : estimate - delta * (totalWeight / nextWeight);
        }
        totalWeight = nextWeight;
    };
    let start = 0;
    for (const event of events) {
        include(event.position - start);
        denominator.add(-weights[event.previous]!);
        denominator.add(weights[event.next]!);
        for (const accumulator of accumulators) {
            if (!accumulator.valid) continue;
            accumulator.numerator.add(-accumulator.weightedValues[event.previous]!);
            accumulator.numerator.add(accumulator.weightedValues[event.next]!);
        }
        start = event.position;
    }
    include(1 - start);
    return Object.fromEntries(accumulators.map(accumulator => {
        const standardError = accumulator.rootM2 / Math.sqrt(totalWeight) * accumulator.scale;
        return [accumulator.key, accumulator.valid && Number.isFinite(standardError)
            && (standardError > 0 || accumulator.rootM2 === 0) ? standardError : null];
    }));
}
