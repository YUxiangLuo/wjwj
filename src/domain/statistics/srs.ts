import type { PopulationNumericStat } from "./population";

export function computeSimpleRandomMeanSe(
    populationStat: PopulationNumericStat | undefined,
    populationSize: number,
    sampleSize: number,
) {
    if (!populationStat || sampleSize < 1 || populationSize < 1) return null;
    if (sampleSize >= populationSize || populationSize <= 1) return 0;
    return computeSimpleRandomValueSe(populationStat.variance, populationSize, sampleSize, populationStat.stdDev);
}

export function computeSimpleRandomValueSe(populationVariance: number, populationSize: number, sampleSize: number, populationStandardDeviation = Math.sqrt(populationVariance)) {
    if (sampleSize < 1 || populationSize < 1) return null;
    if (sampleSize >= populationSize || populationSize <= 1) return 0;
    const samplingFraction = sampleSize / populationSize;
    return populationStandardDeviation * Math.sqrt((1 - samplingFraction) / sampleSize);
}

/**
 * 把设计标准误反解为同一有限总体上的等效 SRS 样本量：
 * SE² = S²(1/n - 1/N) => n = S² / (SE² + S²/N)。
 * 结果天然不超过总体规模；零设计方差或零总体方差按完整总体的信息量展示。
 */
export function computeFinitePopulationEquivalentSampleSize(
    populationVariance: number,
    populationSize: number,
    standardError: number,
    populationStandardDeviation = Math.sqrt(populationVariance),
) {
    if (!Number.isFinite(populationVariance) || populationVariance < 0) return null;
    if (!Number.isInteger(populationSize) || populationSize < 1) return null;
    if (!Number.isFinite(standardError) || standardError < 0) return null;
    if (standardError === 0 || populationStandardDeviation === 0) return populationSize;

    // Use S/SE rather than SE/S so a large relative SE cannot overflow before
    // taking its reciprocal: n = (S/SE)² / (1 + (S/SE)²/N).
    const informationRatio = populationStandardDeviation / standardError;
    if (!Number.isFinite(informationRatio)) return populationSize;
    const information = informationRatio * informationRatio;
    // A positive equivalent n smaller than the representable range is
    // unavailable, not zero units of information.
    if (information === 0) return null;
    if (!Number.isFinite(information)) return populationSize;
    return Math.min(populationSize, information / (1 + information / populationSize));
}
