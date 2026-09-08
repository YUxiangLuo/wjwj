import { zForConfidenceLevel } from "./confidence-level";
import { finitePopulationVarianceFactor } from "./sample-plan";

export interface CostPrecisionPoint {
    sampleSize: number;
    marginOfError: number;
    totalCost: number;
}

/** Densify the curve where straight-line interpolation would misstate precision. */
export function buildCostPrecisionCurve(inputs: {
    populationSize: number;
    confidenceLevel: string;
    designEffect: number;
    nonResponseRate: number;
    fixedCost: number;
    variableCostPerUnit: number;
    referenceSampleSizes: number[];
}) {
    const { populationSize: N, designEffect, nonResponseRate, fixedCost, variableCostPerUnit } = inputs;
    if (!Number.isSafeInteger(N) || N < 1 || !(designEffect > 0) || !Number.isFinite(designEffect)
        || !Number.isFinite(nonResponseRate) || nonResponseRate < 0 || nonResponseRate >= 1
        || ![fixedCost, variableCostPerUnit].every(value => Number.isFinite(value) && value >= 0)) {
        return { points: [], referencePoints: [] };
    }
    const z = zForConfidenceLevel(inputs.confidenceLevel);
    const point = (n: number): CostPrecisionPoint => {
        const completed = n * (1 - nonResponseRate);
        return { sampleSize: n, totalCost: fixedCost + n * variableCostPerUnit,
            marginOfError: z * Math.sqrt(designEffect * .25 / completed * finitePopulationVarianceFactor(N, completed)) * 100 };
    };
    // Include the exact budget/target counts, plus a small readable reference table.
    const sizes = [...new Set([
        1, N, ...inputs.referenceSampleSizes,
        ...Array.from({ length: 12 }, (_, i) => Math.round(Math.exp(Math.log(N) * i / 11))),
    ].filter(n => Number.isSafeInteger(n) && n >= 1 && n <= N))].sort((a, b) => a - b);
    const referencePoints = sizes.map(point);
    const points: CostPrecisionPoint[] = [referencePoints[0]!];
    const refine = (left: CostPrecisionPoint, right: CostPrecisionPoint) => {
        if (right.sampleSize - left.sampleSize > 1) {
            const middle = point(Math.floor((left.sampleSize + right.sampleSize) / 2));
            const fraction = (middle.sampleSize - left.sampleSize) / (right.sampleSize - left.sampleSize);
            const interpolated = left.marginOfError + fraction * (right.marginOfError - left.marginOfError);
            // Refine when midpoint error exceeds 0.25% of the true half-width,
            // with a 0.0025 percentage-point floor.
            if (Math.abs(interpolated - middle.marginOfError) > Math.max(.0025, middle.marginOfError * .0025)) {
                refine(left, middle);
                refine(middle, right);
                return;
            }
        }
        points.push(right);
    };
    for (let i = 1; i < referencePoints.length; i++) refine(referencePoints[i - 1]!, referencePoints[i]!);
    return { points, referencePoints };
}
