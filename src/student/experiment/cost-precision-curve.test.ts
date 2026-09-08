import { expect, test } from "bun:test";
import { buildCostPrecisionCurve } from "./cost-precision-curve";

test("cost interpolation tracks the finite-population formula throughout the allowed population range", () => {
    for (const [N, z, confidenceLevel, deff, nonresponse] of [
        [100000, 1.96, "95", 1, 0], [100000, 2.576, "99", 3, .5], [100, 1.645, "90", .5, .2],
    ] as const) {
        const curve = buildCostPrecisionCurve({ populationSize: N, confidenceLevel, designEffect: deff,
            nonResponseRate: nonresponse, fixedCost: 5000, variableCostPerUnit: 15, referenceSampleSizes: [383, 3000] });
        let worstErrorRatio = 0;
        for (let i = 1; i < curve.points.length; i++) {
            const left = curve.points[i - 1]!, right = curve.points[i]!;
            for (let n = left.sampleSize + 1; n < right.sampleSize; n++) {
                const completed = n * (1 - nonresponse);
                const actual = z * Math.sqrt(deff * .25 / completed * (N - completed) / (N - 1)) * 100;
                const interpolated = left.marginOfError + (right.marginOfError - left.marginOfError)
                    * (n - left.sampleSize) / (right.sampleSize - left.sampleSize);
                worstErrorRatio = Math.max(worstErrorRatio, Math.abs(interpolated - actual) / Math.max(.005, actual * .005));
            }
        }
        expect(worstErrorRatio).toBeLessThan(1);
        expect(curve.points[0]!.sampleSize).toBe(1);
        expect(curve.points.at(-1)!.sampleSize).toBe(N);
        for (const n of [383, 3000].filter(n => n <= N)) {
            expect(curve.referencePoints.some(point => point.sampleSize === n)).toBe(true);
        }
    }
});

test("a one-unit or zero-unit-cost population yields finite plot coordinates and no duplicate reference counts", () => {
    for (const N of [1, 5, 1000]) {
        const curve = buildCostPrecisionCurve({ populationSize: N, confidenceLevel: "95", designEffect: 1,
            nonResponseRate: 0, fixedCost: 0, variableCostPerUnit: 0, referenceSampleSizes: [0, N, N + 1, N] });
        expect(curve.points.every(point => Number.isFinite(point.marginOfError) && point.totalCost === 0)).toBe(true);
        expect(new Set(curve.referencePoints.map(point => point.sampleSize)).size).toBe(curve.referencePoints.length);
        expect(curve.points.at(-1)!.marginOfError).toBe(0);
    }
});
