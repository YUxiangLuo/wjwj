function toPositiveInteger(value: number | null | undefined) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;

    const normalized = Math.floor(parsed);
    if (normalized < 1) return null;
    return normalized;
}

export function getSystematicInterval(
    populationSize: number,
    targetSampleSize: number | null | undefined,
) {
    const normalizedPopulationSize = Math.max(0, Math.floor(Number(populationSize) || 0));
    const normalizedTargetSampleSize = toPositiveInteger(targetSampleSize);

    if (
        normalizedPopulationSize === 0
        || normalizedTargetSampleSize === null
        || normalizedTargetSampleSize > normalizedPopulationSize
    ) {
        return null;
    }

    return normalizedPopulationSize / normalizedTargetSampleSize;
}

export function formatSystematicInterval(interval: number | null | undefined) {
    if (interval === null || interval === undefined || !Number.isFinite(interval) || interval <= 0) {
        return "-";
    }
    return new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: 4,
        minimumFractionDigits: 0,
    }).format(interval);
}

export function getStoredSystematicInterval(value: unknown): number | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const result = value as { interval?: unknown; kValue?: unknown };
    const interval = Number(result.interval ?? result.kValue);
    return Number.isFinite(interval) && interval > 0 ? interval : null;
}
