export function truncateAxisLabel(value: string, maxChars: number): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxChars) return trimmed;
    return `${trimmed.slice(0, Math.max(1, maxChars - 1))}…`;
}

function middleEllipsis(value: string, maxChars: number): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxChars) return trimmed;
    if (maxChars <= 3) return `${trimmed.slice(0, Math.max(1, maxChars - 1))}…`;
    const budget = maxChars - 1;
    const tailLen = Math.max(2, Math.floor(budget / 2));
    const headLen = Math.max(1, budget - tailLen);
    return `${trimmed.slice(0, headLen)}…${trimmed.slice(-tailLen)}`;
}

/**
 * Truncate chart axis labels while avoiding collisions where two distinct
 * labels share the same prefix (e.g. "2026级商业分析班" vs "2026级商务统计1班").
 * Colliding groups automatically switch to middle-ellipsis to preserve the
 * distinguishing suffix; identical raw labels remain identical.
 */
export function disambiguateAxisLabels(labels: readonly string[], maxChars: number): string[] {
    const trimmed = labels.map((label) => label.trim());
    const initial = trimmed.map((label) => truncateAxisLabel(label, maxChars));

    const originalsByTruncated = new Map<string, Set<string>>();
    for (let i = 0; i < initial.length; i++) {
        const key = initial[i]!;
        let set = originalsByTruncated.get(key);
        if (!set) {
            set = new Set<string>();
            originalsByTruncated.set(key, set);
        }
        set.add(trimmed[i]!);
    }

    const result = initial.map((label, i) => {
        const group = originalsByTruncated.get(label);
        if (!group || group.size <= 1) return label;
        return middleEllipsis(trimmed[i]!, maxChars);
    });

    // If middle-ellipsis still collides for distinct originals (e.g. difference in middle),
    // append compact index suffix only for still-colliding distinct items.
    const originalsByResult = new Map<string, Set<string>>();
    for (let i = 0; i < result.length; i++) {
        const key = result[i]!;
        let set = originalsByResult.get(key);
        if (!set) {
            set = new Set<string>();
            originalsByResult.set(key, set);
        }
        set.add(trimmed[i]!);
    }

    const seenOrder = new Map<string, Map<string, number>>();
    return result.map((label, i) => {
        const group = originalsByResult.get(label);
        if (!group || group.size <= 1) return label;
        let map = seenOrder.get(label);
        if (!map) {
            map = new Map<string, number>();
            seenOrder.set(label, map);
        }
        const orig = trimmed[i]!;
        if (!map.has(orig)) map.set(orig, map.size + 1);
        return `${label} (${map.get(orig)})`;
    });
}
