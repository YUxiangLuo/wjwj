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
