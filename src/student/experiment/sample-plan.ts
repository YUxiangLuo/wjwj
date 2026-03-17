const Z_SCORES = new Map<number, number>([
    [0.90, 1.645],
    [0.95, 1.96],
    [0.99, 2.576],
]);

export function calculateFinitePopulationSampleSize(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    expectedProportion?: unknown;
    designEffect?: unknown;
    nonResponseRate?: unknown;
    populationSize: number | null | undefined;
}) {
    if (!params.populationSize || params.populationSize <= 0) {
        return null;
    }

    const confidenceValue = Number(params.confidenceLevel);
    const confidenceRatio = confidenceValue > 1 ? confidenceValue / 100 : confidenceValue;
    const errorValue = Number(params.marginOfError);
    const errorRatio = errorValue > 1 ? errorValue / 100 : errorValue;

    const z = Z_SCORES.get(confidenceRatio);
    if (z === undefined) return null;

    const e = errorRatio;
    const N = params.populationSize;
    const expectedProportionValue = Number(params.expectedProportion);
    // Values > 1 are interpreted as percentages from the UI (e.g. 50 -> 50%),
    // while values between 0 and 1 are treated as decimal ratios for backward compatibility.
    const expectedProportionRatio = expectedProportionValue > 1 ? expectedProportionValue / 100 : expectedProportionValue;
    const p = Number.isFinite(expectedProportionRatio) && expectedProportionRatio > 0 && expectedProportionRatio < 1
        ? expectedProportionRatio
        : 0.5;
    const designEffect = Math.max(1, Number(params.designEffect) || 1);
    const nonResponseRateValue = Number(params.nonResponseRate);
    const nonResponseRateRatio = nonResponseRateValue > 1 ? nonResponseRateValue / 100 : nonResponseRateValue;
    const nonResponseFactor = Number.isFinite(nonResponseRateRatio) && nonResponseRateRatio >= 0 && nonResponseRateRatio < 1
        ? 1 - nonResponseRateRatio
        : 1;

    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    const n = n0 / (1 + (n0 - 1) / N);
    const adjusted = (n * designEffect) / nonResponseFactor;

    return Math.ceil(adjusted);
}

export function attachCalculatedSampleSize(samplePlan: Record<string, any>, populationSize: number | null | undefined) {
    if (!samplePlan?.confidenceLevel || !samplePlan?.marginOfError) {
        return samplePlan;
    }

    const calculatedSampleSize = calculateFinitePopulationSampleSize({
        confidenceLevel: samplePlan.confidenceLevel,
        marginOfError: samplePlan.marginOfError,
        expectedProportion: samplePlan.expectedProportion,
        designEffect: samplePlan.designEffect,
        nonResponseRate: samplePlan.nonResponseRate,
        populationSize,
    });

    if (calculatedSampleSize) {
        samplePlan.calculatedSampleSize = calculatedSampleSize;
    }

    return samplePlan;
}
