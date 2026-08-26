export interface SamplingAcceptedRange {
    min: number;
    max: number;
}

export function getSamplingAcceptedRange(
    targetSampleSize: number | null | undefined,
    populationSize?: number | null,
): SamplingAcceptedRange | null {
    const parsed = Number(targetSampleSize);
    if (!Number.isFinite(parsed) || parsed < 1) return null;

    const normalized = Math.floor(parsed);
    // Integer sample counts must themselves remain inside the stated 80%–120% interval.
    const rawMin = Math.max(1, Math.ceil(normalized * 0.8));
    const rawMax = Math.max(rawMin, Math.floor(normalized * 1.2));
    const parsedPopulation = Number(populationSize);
    if (!Number.isFinite(parsedPopulation) || parsedPopulation < 1) {
        return { min: rawMin, max: rawMax };
    }

    const populationMax = Math.max(1, Math.floor(parsedPopulation));
    const max = Math.min(rawMax, populationMax);
    return { min: Math.min(rawMin, max), max };
}

export function formatSamplingRange(range: SamplingAcceptedRange | null) {
    if (!range) return "";
    return range.min === range.max ? `${range.min}` : `${range.min}-${range.max}`;
}
