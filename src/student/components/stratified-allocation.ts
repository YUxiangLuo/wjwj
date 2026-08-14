function fractionalPart(value: number): number {
    return value - Math.floor(value);
}

export function allocateStratifiedSampleCounts(params: {
    targetSampleSize: number;
    rawCounts: number[];
    caps: number[];
    minPerLayer?: number;
}): number[] {
    const targetSampleSize = Math.max(0, Math.round(params.targetSampleSize));
    const minPerLayer = Math.max(0, Math.floor(params.minPerLayer ?? 1));
    const rawCounts = params.rawCounts.map((value) => Number.isFinite(value) && value > 0 ? value : 0);
    const caps = params.caps.map((value) => Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)));

    const counts = rawCounts.map((raw, index) => {
        const cap = caps[index] ?? 0;
        return Math.min(cap, Math.max(minPerLayer, Math.floor(raw)));
    });

    let diff = targetSampleSize - counts.reduce((sum, count) => sum + count, 0);
    const indices = counts.map((_, index) => index);

    if (diff > 0) {
        const incrementOrder = [...indices].sort((left, right) => {
            const fractionalDiff = fractionalPart(rawCounts[right] ?? 0) - fractionalPart(rawCounts[left] ?? 0);
            if (fractionalDiff !== 0) return fractionalDiff;
            return (caps[right] ?? 0) - (caps[left] ?? 0);
        });

        while (diff > 0) {
            let progressed = false;
            for (const index of incrementOrder) {
                if (diff <= 0) break;
                if ((counts[index] ?? 0) < (caps[index] ?? 0)) {
                    counts[index]!++;
                    diff--;
                    progressed = true;
                }
            }
            if (!progressed) break;
        }
    } else if (diff < 0) {
        const decrementOrder = [...indices].sort((left, right) => {
            const overallocationDiff = ((counts[right] ?? 0) - (rawCounts[right] ?? 0)) - ((counts[left] ?? 0) - (rawCounts[left] ?? 0));
            if (overallocationDiff !== 0) return overallocationDiff;
            return fractionalPart(rawCounts[left] ?? 0) - fractionalPart(rawCounts[right] ?? 0);
        });

        while (diff < 0) {
            let progressed = false;
            for (const index of decrementOrder) {
                if (diff >= 0) break;
                if ((counts[index] ?? 0) > minPerLayer) {
                    counts[index]!--;
                    diff++;
                    progressed = true;
                }
            }
            if (!progressed) break;
        }
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
