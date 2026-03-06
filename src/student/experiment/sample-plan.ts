export function calculateFinitePopulationSampleSize(params: {
    confidenceLevel: unknown;
    marginOfError: unknown;
    populationSize: number | null | undefined;
}) {
    if (!params.populationSize || params.populationSize <= 0) {
        return null;
    }

    const confidenceValue = Number(params.confidenceLevel);
    const confidenceRatio = confidenceValue > 1 ? confidenceValue / 100 : confidenceValue;
    const errorValue = Number(params.marginOfError);
    const errorRatio = errorValue > 1 ? errorValue / 100 : errorValue;

    const z = confidenceRatio >= 0.99 ? 2.576 : confidenceRatio >= 0.95 ? 1.96 : confidenceRatio >= 0.9 ? 1.645 : 1.96;
    const e = errorRatio;
    const N = params.populationSize;
    const p = 0.5;

    const n0 = (Math.pow(z, 2) * p * (1 - p)) / Math.pow(e, 2);
    const n = n0 / (1 + (n0 - 1) / N);

    return Math.ceil(n);
}

export function attachCalculatedSampleSize(samplePlan: Record<string, any>, populationSize: number | null | undefined) {
    if (!samplePlan?.confidenceLevel || !samplePlan?.marginOfError) {
        return samplePlan;
    }

    const calculatedSampleSize = calculateFinitePopulationSampleSize({
        confidenceLevel: samplePlan.confidenceLevel,
        marginOfError: samplePlan.marginOfError,
        populationSize,
    });

    if (calculatedSampleSize) {
        samplePlan.calculatedSampleSize = calculatedSampleSize;
    }

    return samplePlan;
}
