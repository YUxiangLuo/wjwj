import type { PopulationNumericStat } from "./population";

export function computeSimpleRandomMeanSe(
    populationStat: PopulationNumericStat | undefined,
    populationSize: number,
    sampleSize: number,
) {
    if (!populationStat || sampleSize < 1 || populationSize < 1) return null;
    if (sampleSize >= populationSize || populationSize <= 1) return 0;
    const samplingFraction = sampleSize / populationSize;
    return Math.sqrt((1 - samplingFraction) * populationStat.variance / sampleSize);
}

export function computeSimpleRandomValueSe(populationVariance: number, populationSize: number, sampleSize: number) {
    if (sampleSize < 1 || populationSize < 1) return null;
    if (sampleSize >= populationSize || populationSize <= 1) return 0;
    const samplingFraction = sampleSize / populationSize;
    return Math.sqrt((1 - samplingFraction) * populationVariance / sampleSize);
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
) {
    if (!Number.isFinite(populationVariance) || populationVariance < 0) return null;
    if (!Number.isInteger(populationSize) || populationSize < 1) return null;
    if (!Number.isFinite(standardError) || standardError < 0) return null;
    if (standardError === 0 || populationVariance === 0) return populationSize;

    // Normalize before squaring so tiny but valid SE² and S²/N do not both
    // underflow. This is 1 / ((SE/S)² + 1/N), algebraically the same inversion.
    const relativeSe = standardError / Math.sqrt(populationVariance);
    return Math.min(populationSize, 1 / (relativeSe * relativeSe + 1 / populationSize));
}
