export interface SamplingAcceptedRange {
    min: number;
    max: number;
}

export function getSamplingAcceptedRange(
    targetSampleSize: number | null | undefined,
): SamplingAcceptedRange | null {
    const parsed = Number(targetSampleSize);
    if (!Number.isFinite(parsed) || parsed < 1) return null;

    const normalized = Math.floor(parsed);
    return {
        min: Math.floor(normalized * 0.8),
        max: Math.ceil(normalized * 1.2),
    };
}

export function formatSamplingRange(range: SamplingAcceptedRange | null) {
    if (!range) return "";
    return range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`;
}
