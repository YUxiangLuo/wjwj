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

export function performSimpleSampling(data: any[], n: number, random: () => number): any[] {
    const sampleSize = Math.max(0, Math.min(Number(n) || 0, data.length));
    // Partial Fisher-Yates: only shuffle the last `sampleSize` positions — O(n) instead of O(N)
    const indices = Array.from({ length: data.length }, (_, i) => i);

    for (let i = indices.length - 1; i >= indices.length - sampleSize && i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const temp = indices[i]!;
        indices[i] = indices[j]!;
        indices[j] = temp;
    }

    const selectedIndices = indices.slice(indices.length - sampleSize);
    return selectedIndices.map((i) => data[i]);
}

export function performSystematicSampling(data: any[], k: number, random: () => number): any[] {
    const step = Math.max(1, Number(k) || 1);
    const start = Math.floor(random() * step);
    const result = [];

    for (let i = start; i < data.length; i += step) {
        result.push(data[i]);
    }

    return result;
}

export function performStratifiedSampling(data: any[], stratifyBy: string, layers: any[], random: () => number): any[] {
    const result: any[] = [];
    const groups: Record<string, any[]> = {};
    for (const item of data) {
        const val = String(item[stratifyBy]);
        if (!groups[val]) groups[val] = [];
        groups[val].push(item);
    }

    for (const layer of layers) {
        const groupData = groups[layer.name] || [];
        const sampleCount = layer.sampleCount;

        if (sampleCount > 0 && groupData.length > 0) {
            const sampled = performSimpleSampling(groupData, sampleCount, random);
            result.push(...sampled);
        }
    }

    return result;
}

/**
 * PPS (Probability Proportional to Size) sampling.
 *
 * Each unit's selection probability is proportional to its "size" value
 * (given by `sizeField`). Uses systematic PPS selection:
 *   1. Compute cumulative sizes.
 *   2. Determine the sampling interval = totalSize / n.
 *   3. Pick a random start in [0, interval).
 *   4. Walk through cumulative sizes to select n units.
 *
 * Returns an array of selected data items.
 */
export function performPPSSampling(
    data: any[],
    sizeField: string,
    n: number,
    random: () => number,
): any[] {
    if (data.length === 0 || n <= 0) return [];

    const sampleSize = Math.min(n, data.length);

    // Build cumulative size array
    const sizes: number[] = data.map((item) => {
        const val = Number(item[sizeField]);
        return Number.isFinite(val) && val > 0 ? val : 0;
    });

    const totalSize = sizes.reduce((a, b) => a + b, 0);
    if (totalSize <= 0) {
        // Fallback to simple random sampling when all sizes are zero
        return performSimpleSampling(data, sampleSize, random);
    }

    const interval = totalSize / sampleSize;
    const start = random() * interval;

    const cumulative: number[] = [];
    let cumSum = 0;
    for (const size of sizes) {
        cumSum += size;
        cumulative.push(cumSum);
    }

    const selected: any[] = [];
    const selectedIndices = new Set<number>();
    let pointer = start;
    let dataIdx = 0;

    for (let i = 0; i < sampleSize; i++) {
        // Find the unit where cumulative size crosses the pointer
        while (dataIdx < cumulative.length - 1 && (cumulative[dataIdx] ?? 0) < pointer) {
            dataIdx++;
        }
        if (!selectedIndices.has(dataIdx)) {
            selectedIndices.add(dataIdx);
            selected.push(data[dataIdx]);
        }
        pointer += interval;

        // Wrap around if pointer exceeds totalSize (shouldn't happen with correct n)
        if (pointer >= totalSize && i < sampleSize - 1) {
            pointer -= totalSize;
            dataIdx = 0;
        }
    }

    return selected;
}
