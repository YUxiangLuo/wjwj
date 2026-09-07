import { resolveSamplingPolicy } from "../../lib/sampling-policy";

/** At least one available stratification must cover the whole frame with n >= H. */
export function getRequiredStratifiedMinimum(
    stats: Record<string, Record<string, number>> | undefined,
    samplingPolicy: unknown,
    populationSize: number,
): number | null {
    if (resolveSamplingPolicy(samplingPolicy).methods.stratified !== "required") return 1;
    const layerCounts = Object.values(stats ?? {}).flatMap((groups) => {
        const counts = Object.values(groups);
        return counts.length > 0 && counts.every((n) => Number.isInteger(n) && n > 0)
            && counts.reduce((sum, n) => sum + n, 0) === populationSize ? [counts.length] : [];
    });
    return layerCounts.length > 0 ? Math.min(...layerCounts) : null;
}

/** Base interval 1..N, optionally tightened by a required design's lower bound. */
export function getFinalSampleSizeBounds(populationSize: number, minimumSampleSize = 1): { min: number; max: number } {
    const n = Math.max(0, Math.floor(populationSize));
    if (n < 1) {
        return { min: 1, max: Math.max(1, n) };
    }
    return { min: Math.max(1, Math.ceil(minimumSampleSize)), max: n };
}
