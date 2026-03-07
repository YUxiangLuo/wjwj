export interface SystematicSampleCountRange {
    min: number;
    max: number;
}

export interface SystematicAcceptedRange {
    min: number;
    max: number;
}

function toPositiveInteger(value: number | null | undefined) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;

    const normalized = Math.floor(parsed);
    if (normalized < 1) return null;
    return normalized;
}

export function getSystematicSampleCountRange(populationSize: number, kValue: number): SystematicSampleCountRange {
    const normalizedPopulationSize = Math.max(0, Math.floor(Number(populationSize) || 0));
    const normalizedKValue = toPositiveInteger(kValue);

    if (normalizedPopulationSize === 0 || normalizedKValue === null) {
        return { min: 0, max: 0 };
    }

    if (normalizedKValue > normalizedPopulationSize) {
        return { min: 0, max: 1 };
    }

    return {
        min: Math.floor(normalizedPopulationSize / normalizedKValue),
        max: Math.ceil(normalizedPopulationSize / normalizedKValue),
    };
}

export function getSystematicAcceptedRange(targetSampleSize: number | null | undefined): SystematicAcceptedRange | null {
    const normalizedTargetSampleSize = toPositiveInteger(targetSampleSize);
    if (normalizedTargetSampleSize === null) return null;

    return {
        min: Math.floor(normalizedTargetSampleSize * 0.8),
        max: Math.ceil(normalizedTargetSampleSize * 1.2),
    };
}

export function isSystematicRangeWithinAcceptedRange(
    sampleCountRange: SystematicSampleCountRange,
    acceptedRange: SystematicAcceptedRange | null,
) {
    if (!acceptedRange) return true;

    return sampleCountRange.min >= acceptedRange.min && sampleCountRange.max <= acceptedRange.max;
}

export function formatSystematicRange(range: SystematicSampleCountRange | SystematicAcceptedRange | null) {
    if (!range) return "";
    return range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`;
}
