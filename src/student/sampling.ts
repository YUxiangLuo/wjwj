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

export function performPpsSampling(data: any[], sizeField: string, n: number, random: () => number): any[] {
    const sampleSize = Math.max(0, Math.min(Number(n) || 0, data.length));
    if (sampleSize === 0) {
        return [];
    }

    const weightedRows = data
        .map((row) => {
            const weight = Number(row?.[sizeField]);
            if (!Number.isFinite(weight) || weight <= 0) {
                return null;
            }

            // Guard against log(0), which would otherwise produce Infinity and break the PPS key ranking.
            const u = Math.max(random(), Number.MIN_VALUE);
            return {
                row,
                key: -Math.log(u) / weight,
            };
        })
        .filter((entry): entry is { row: any; key: number } => entry !== null);

    if (weightedRows.length === 0) {
        return [];
    }

    return weightedRows
        .sort((left, right) => left.key - right.key)
        .slice(0, Math.min(sampleSize, weightedRows.length))
        .map((entry) => entry.row);
}
