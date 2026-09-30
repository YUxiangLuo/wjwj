function fractionalPart(value: number): number {
    return value - Math.floor(value);
}

/**
 * Fixed total n, equal unit costs, independent SRS within each stratum.
 * The marginal decrease A_h/[n_h(n_h+1)] is decreasing in n_h, so assigning
 * each next unit to the largest decrease solves the bounded integer problem.
 * Zero-variance strata retain one observation; unknown variances are rejected.
 */
export function allocateNeymanSampleCounts(params: {
    targetSampleSize: number;
    populationCounts: number[];
    stdDevs: number[];
}): number[] | null {
    const { targetSampleSize: target, populationCounts: caps, stdDevs } = params;
    if (!Number.isInteger(target) || caps.length !== stdDevs.length
        || caps.some((cap) => !Number.isInteger(cap) || cap < 0)
        || stdDevs.some((value) => !Number.isFinite(value) || value < 0)) return null;
    const counts: number[] = caps.map((cap) => cap > 0 ? 1 : 0);
    let remaining = target - counts.reduce((sum, n) => sum + n, 0);
    if (remaining < 0 || target > caps.reduce((sum, cap) => sum + cap, 0)) return null;
    // Compare log marginal gains: global rescaling followed by squaring can
    // erase small strata that still matter after larger strata reach census.
    const logCoefficients = caps.map((cap, i) => 2 * (Math.log(cap) + Math.log(stdDevs[i]!)));
    while (remaining > 0) {
        let best = -1;
        let gain = -Infinity;
        for (let i = 0; i < caps.length; i++) {
            const n = counts[i]!;
            if (n >= caps[i]!) continue;
            const nextGain = logCoefficients[i]! - Math.log(n) - Math.log(n + 1);
            if (best < 0 || nextGain > gain) { best = i; gain = nextGain; }
        }
        if (best < 0) return null;
        counts[best]!++;
        remaining--;
    }
    return counts;
}

/**
 * 按原始权重做带上下界的比例分配，再用最大余数法整数化。
 * 层达到容量上限后会锁定并重新归一化剩余层权重，避免退化成轮询等额分配。
 */
export function allocateStratifiedSampleCounts(params: {
    targetSampleSize: number;
    rawCounts: number[];
    caps: number[];
    minPerLayer?: number;
}): number[] {
    const requestedTarget = Math.max(0, Math.round(params.targetSampleSize));
    const minPerLayer = Math.max(0, Math.floor(params.minPerLayer ?? 1));
    const rawCounts = params.rawCounts.map((value) => Number.isFinite(value) && value > 0 ? value : 0);
    const caps = rawCounts.map((_, index) => {
        const value = params.caps[index];
        return Math.max(0, Math.floor(Number.isFinite(value) ? Number(value) : 0));
    });
    const lowerBounds = caps.map((cap) => Math.min(cap, minPerLayer));
    const lowerBoundTotal = lowerBounds.reduce((sum, value) => sum + value, 0);
    const capacityTotal = caps.reduce((sum, value) => sum + value, 0);
    // 保持既有 minPerLayer 契约：目标本身不可行时优先保住每层下限。
    const target = Math.min(capacityTotal, Math.max(requestedTarget, lowerBoundTotal));
    const indexes = rawCounts.map((_, index) => index);

    const solveBoundedProportions = (
        selectedIndexes: number[],
        selectedTarget: number,
        weights: number[],
    ) => {
        const values = Array<number>(rawCounts.length).fill(0);
        const lowerTotal = selectedIndexes.reduce((sum, index) => sum + (lowerBounds[index] ?? 0), 0);
        if (selectedTarget <= lowerTotal) {
            for (const index of selectedIndexes) values[index] = lowerBounds[index] ?? 0;
            return values;
        }

        // x_i = clamp(lambda * w_i, lower_i, cap_i). The clamped sum is
        // monotone in lambda, so bisection avoids prematurely freezing a lower
        // bound that may become non-binding after another layer is capped.
        const upperLambda = selectedIndexes.reduce((maximum, index) => {
            const weight = weights[index] ?? 0;
            return weight > 0 ? Math.max(maximum, (caps[index] ?? 0) / weight) : maximum;
        }, 0);
        let low = 0;
        let high = upperLambda;
        for (let iteration = 0; iteration < 80; iteration += 1) {
            const lambda = (low + high) / 2;
            const sum = selectedIndexes.reduce((total, index) => {
                const proportional = lambda * (weights[index] ?? 0);
                return total + Math.min(caps[index] ?? 0, Math.max(lowerBounds[index] ?? 0, proportional));
            }, 0);
            if (sum < selectedTarget) low = lambda;
            else high = lambda;
        }
        for (const index of selectedIndexes) {
            const proportional = high * (weights[index] ?? 0);
            values[index] = Math.min(caps[index] ?? 0, Math.max(lowerBounds[index] ?? 0, proportional));
        }
        return values;
    };

    const positiveIndexes = indexes.filter((index) => (rawCounts[index] ?? 0) > 0);
    const zeroWeightIndexes = indexes.filter((index) => (rawCounts[index] ?? 0) === 0);
    const positiveMaximumWithZeroLowerBounds = positiveIndexes.reduce(
        (sum, index) => sum + (caps[index] ?? 0),
        zeroWeightIndexes.reduce((sum, index) => sum + (lowerBounds[index] ?? 0), 0),
    );

    let continuous: number[];
    if (positiveIndexes.length === 0) {
        continuous = solveBoundedProportions(indexes, target, indexes.map(() => 1));
    } else if (target <= positiveMaximumWithZeroLowerBounds) {
        continuous = solveBoundedProportions(indexes, target, rawCounts);
    } else {
        // Positive-weight layers are exhausted. Only then may genuinely
        // zero-weight layers receive the otherwise unallocatable remainder.
        continuous = Array<number>(rawCounts.length).fill(0);
        for (const index of positiveIndexes) continuous[index] = caps[index] ?? 0;
        const zeroTarget = target - positiveIndexes.reduce((sum, index) => sum + (caps[index] ?? 0), 0);
        const zeroValues = solveBoundedProportions(zeroWeightIndexes, zeroTarget, indexes.map(() => 1));
        for (const index of zeroWeightIndexes) continuous[index] = zeroValues[index] ?? 0;
    }

    const counts = continuous.map((value, index) => (
        Math.min(caps[index] ?? 0, Math.max(lowerBounds[index] ?? 0, Math.floor(value)))
    ));
    let remainder = target - counts.reduce((sum, value) => sum + value, 0);
    const incrementOrder = indexes.sort((left, right) => {
        const fractionalDiff = fractionalPart(continuous[right] ?? 0) - fractionalPart(continuous[left] ?? 0);
        if (Math.abs(fractionalDiff) > Number.EPSILON) return fractionalDiff;
        const weightDiff = (rawCounts[right] ?? 0) - (rawCounts[left] ?? 0);
        return weightDiff !== 0 ? weightDiff : left - right;
    });

    while (remainder > 0) {
        let progressed = false;
        for (const index of incrementOrder) {
            if (remainder <= 0) break;
            if ((counts[index] ?? 0) < (caps[index] ?? 0)) {
                counts[index]!++;
                remainder--;
                progressed = true;
            }
        }
        if (!progressed) break;
    }

    return counts;
}

export interface StratumAllocationInput {
    name: string;
    populationSize: number;
    sampleSize: number;
}

export interface ResolvedStratumAllocation {
    name: string;
    count: number;
    sampleCount: number;
}

/**
 * 超额层改为全数调查后，把剩余名额按原分配权重分给未满层。
 * 总样本量能保住则保住；全部层都满了才允许小于原计划。
 */
export function resolveStratumOverflow(allocation: StratumAllocationInput[]): {
    allocation: ResolvedStratumAllocation[];
    hasOverAllocation: boolean;
    overAllocatedLayers: string[];
    adjustedTotalSampleSize: number;
} {
    const overAllocatedLayers = allocation
        .filter((layer) => layer.sampleSize > layer.populationSize)
        .map((layer) => layer.name);
    const targetTotal = allocation.reduce((sum, layer) => sum + Math.max(0, Math.round(layer.sampleSize)), 0);

    if (overAllocatedLayers.length === 0) {
        const resolved = allocation.map((layer) => ({
            name: layer.name,
            count: layer.populationSize,
            sampleCount: Math.max(0, Math.round(layer.sampleSize)),
        }));
        return {
            allocation: resolved,
            hasOverAllocation: false,
            overAllocatedLayers,
            adjustedTotalSampleSize: resolved.reduce((sum, layer) => sum + layer.sampleCount, 0),
        };
    }

    const locked = new Set(overAllocatedLayers);
    const sampleCounts = allocation.map((layer) => (
        locked.has(layer.name)
            ? layer.populationSize
            : Math.max(0, Math.round(layer.sampleSize))
    ));

    const lockedSum = allocation.reduce((sum, layer, index) => (
        locked.has(layer.name) ? sum + (sampleCounts[index] ?? 0) : sum
    ), 0);
    const remainingTarget = Math.max(0, targetTotal - lockedSum);
    const unlockedIndexes = allocation
        .map((_, index) => index)
        .filter((index) => !locked.has(allocation[index]!.name));

    if (unlockedIndexes.length > 0 && remainingTarget > 0) {
        const weightSum = unlockedIndexes.reduce((sum, index) => {
            const original = allocation[index]!.sampleSize;
            return sum + (original > 0 ? original : 0);
        }, 0);
        const nextCounts = allocateStratifiedSampleCounts({
            targetSampleSize: remainingTarget,
            rawCounts: unlockedIndexes.map((index) => {
                const original = allocation[index]!.sampleSize;
                if (weightSum > 0 && original > 0) return remainingTarget * original / weightSum;
                return remainingTarget / unlockedIndexes.length;
            }),
            caps: unlockedIndexes.map((index) => allocation[index]!.populationSize),
            minPerLayer: 0,
        });
        unlockedIndexes.forEach((index, position) => {
            sampleCounts[index] = nextCounts[position] ?? 0;
        });
    } else if (unlockedIndexes.length > 0 && remainingTarget === 0) {
        unlockedIndexes.forEach((index) => {
            sampleCounts[index] = 0;
        });
    }

    const resolved = allocation.map((layer, index) => ({
        name: layer.name,
        count: layer.populationSize,
        sampleCount: sampleCounts[index] ?? 0,
    }));

    return {
        allocation: resolved,
        hasOverAllocation: true,
        overAllocatedLayers,
        adjustedTotalSampleSize: resolved.reduce((sum, layer) => sum + layer.sampleCount, 0),
    };
}
