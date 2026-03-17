export interface AllocationLayer {
    name: string;
    count: number;
    ratio: number;
}

export function normalizeAllocationToTarget(layers: AllocationLayer[], counts: number[], targetSampleSize: number) {
    const caps = layers.map((layer) => layer.count);
    const normalized = counts.map((count, index) =>
        Math.max(0, Math.min(Math.round(count), caps[index] ?? Number.POSITIVE_INFINITY))
    );

    if (normalized.length === 0) {
        return normalized;
    }

    let total = normalized.reduce((sum, count) => sum + count, 0);
    let cursor = 0;
    let safetyLimit = normalized.length * Math.max(targetSampleSize, 1) * 2;

    while (total < targetSampleSize && safetyLimit > 0) {
        const index = cursor % normalized.length;
        const current = normalized[index] ?? 0;
        const cap = caps[index] ?? Number.POSITIVE_INFINITY;
        if (current < cap) {
            normalized[index] = current + 1;
            total += 1;
        }
        cursor += 1;
        safetyLimit -= 1;
    }

    cursor = 0;
    safetyLimit = normalized.length * Math.max(total, 1) * 2;
    while (total > targetSampleSize && safetyLimit > 0) {
        const index = cursor % normalized.length;
        const current = normalized[index] ?? 0;
        if (current > 0) {
            normalized[index] = current - 1;
            total -= 1;
        }
        cursor += 1;
        safetyLimit -= 1;
    }

    return normalized;
}

export function getProportionalAllocation(layers: AllocationLayer[], targetSampleSize: number) {
    return normalizeAllocationToTarget(layers, layers.map((layer) => targetSampleSize * layer.ratio / 100), targetSampleSize);
}

export function getEqualAllocation(layers: AllocationLayer[], targetSampleSize: number) {
    if (layers.length === 0) {
        return [];
    }

    const equalCount = Math.floor(targetSampleSize / layers.length);
    const remainder = targetSampleSize % layers.length;
    return normalizeAllocationToTarget(
        layers,
        layers.map((_, index) => equalCount + (index < remainder ? 1 : 0)),
        targetSampleSize,
    );
}

export function getSqrtAllocation(layers: AllocationLayer[], targetSampleSize: number) {
    const weights = layers.map((layer) => Math.sqrt(Math.max(layer.count, 0)));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

    if (totalWeight <= 0) {
        return normalizeAllocationToTarget(layers, layers.map(() => 0), targetSampleSize);
    }

    return normalizeAllocationToTarget(
        layers,
        weights.map((weight) => targetSampleSize * weight / totalWeight),
        targetSampleSize,
    );
}
