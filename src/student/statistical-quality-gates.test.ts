import { expect, test } from "bun:test";
import { ADVANCED_TAB_CONFIG } from "./components/sample-planning/advancedTabs";
import { allocateStratifiedSampleCounts } from "./components/stratified-allocation";
import { buildPopulationNumericStats } from "../domain/statistics/population";
import { validateMappedPopulationData } from "../teacher/topic/validation";
import {
    calculateFinitePopulationSampleSize,
    calculateMeanEstimationSampleSize,
    calculateMeanSampleSizeMetrics,
    calculateOptimalAllocationWithCost,
    calculateSampleSizeStepDetails,
    finitePopulationS2ToSigma2,
    finitePopulationVarianceFactor,
} from "./experiment/sample-plan";

// Authority anchors: Statistics Canada / UN for SRS and FPC, Penn State STAT 506
// for stratified allocation, and NIST for normal-approximation planning.
test("authority benchmark: SRS proportion and mean formulas match documented finite-population values", () => {
    expect(calculateFinitePopulationSampleSize({
        confidenceLevel: 95,
        marginOfError: 5,
        populationSize: 1000,
        p: 0.5,
    })).toBe(278);

    expect(calculateMeanEstimationSampleSize({
        confidenceLevel: 95,
        marginOfError: 2,
        populationSize: 1000,
        populationVariance: 100,
    })).toBe(88);

    expect(finitePopulationVarianceFactor(60, 53)).toBeCloseTo(7 / 59, 14);
});

test("publishable large mean variance reaches a census instead of a zero recommendation", () => {
    const amplitude = Math.sqrt(1e307);
    const rows = Array.from({ length: 100 }, (_, index) => ({
        id: String(index),
        value: index < 50 ? -amplitude : amplitude,
    }));
    const parsed = { rows, columns: ["id", "value"], rowCount: rows.length, colCount: 2 };
    expect(validateMappedPopulationData(parsed, {
        identifier: "id", numeric: ["value"], analysisTarget: { kind: "mean", field: "value" },
    })).toBeNull();

    const stat = buildPopulationNumericStats(rows, ["value"]).value!;
    const sigma2 = finitePopulationS2ToSigma2(stat.variance, rows.length)!;
    expect(sigma2 / 1e307).toBeCloseTo(1, 12);
    const params = {
        confidenceLevel: "95", marginOfError: 1, populationSize: rows.length,
        populationVariance: sigma2, designEffect: 1, nonResponseRate: 0,
    };

    // The finite-population equation has a positive solution just below N,
    // so rounding up requires all 100 units even though n0*N overflows.
    expect(calculateMeanEstimationSampleSize(params)).toBe(100);
    const steps = calculateSampleSizeStepDetails({ ...params, estimationType: "mean" });
    expect(steps.n2Raw).toBe(100);
    expect(steps.n3).toBe(100);

    const metrics = calculateMeanSampleSizeMetrics(params)!;
    expect(metrics.n).toBe(100);
    expect(metrics.expectedCompleted).toBe(100);
    expect(metrics.standardError).toBe(0);
    expect(metrics.marginOfError).toBe(0);

    const nonresponse = calculateMeanSampleSizeMetrics({ ...params, nonResponseRate: 0.2 })!;
    expect(nonresponse.n).toBe(100);
    expect(nonresponse.expectedCompleted).toBe(80);
    expect(nonresponse.standardError).toBeGreaterThan(0);
    expect(nonresponse.precisionUnreachable).toBe(true);

    // Both the allowed deff ceiling and a very small positive error limit can
    // overflow an intermediate target while the finite-population answer is N.
    for (const variant of [
        { ...params, designEffect: 5 },
        { ...params, marginOfError: 1e-300 },
    ]) {
        const overflowSteps = calculateSampleSizeStepDetails({ ...variant, estimationType: "mean" });
        const overflowMetrics = calculateMeanSampleSizeMetrics(variant)!;
        expect(calculateMeanEstimationSampleSize(variant)).toBe(100);
        expect(overflowSteps.n3).toBe(100);
        expect([overflowSteps.n0Raw, overflowSteps.n1Raw, overflowSteps.n2Raw,
            overflowMetrics.n0, overflowMetrics.nDeff, overflowMetrics.nFpc]
            .every(Number.isFinite)).toBe(true);
    }
});

test("authority benchmark: equal-cost optimum reduces to Neyman allocation", () => {
    const result = calculateOptimalAllocationWithCost([
        { name: "A", populationSize: 100, stdDev: 10, unitCost: 1 },
        { name: "B", populationSize: 200, stdDev: 5, unitCost: 1 },
    ], 100);

    expect(result?.allocation.map((layer) => layer.sampleSize)).toEqual([50, 50]);
    expect(result?.totalSampleSize).toBe(100);
    expect(result?.totalCost).toBe(100);
});

test("property gate: capacity-constrained allocation preserves remaining Neyman weights", () => {
    const allocation = allocateStratifiedSampleCounts({
        targetSampleSize: 100,
        rawCounts: [80, 15, 5],
        caps: [1, 100, 100],
    });
    expect(allocation).toEqual([1, 74, 25]);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(allocation[1]! / allocation[2]!).toBeCloseTo(3, 1);
});

test("property gate: precision, population cap, symmetry, and nonresponse remain coherent", () => {
    for (const populationSize of [2, 3, 10, 60, 1000, 10_000]) {
        const loose = calculateFinitePopulationSampleSize({
            confidenceLevel: 95,
            marginOfError: 10,
            populationSize,
            p: 0.5,
        });
        const strict = calculateFinitePopulationSampleSize({
            confidenceLevel: 95,
            marginOfError: 3,
            populationSize,
            p: 0.5,
        });
        const withNonresponse = calculateFinitePopulationSampleSize({
            confidenceLevel: 95,
            marginOfError: 3,
            populationSize,
            p: 0.5,
            nonResponseRate: 0.4,
        });

        expect(loose).toBeGreaterThanOrEqual(1);
        expect(strict).toBeGreaterThanOrEqual(loose!);
        expect(withNonresponse).toBeGreaterThanOrEqual(strict!);
        expect(withNonresponse).toBeLessThanOrEqual(populationSize);
    }

    const rareLow = calculateFinitePopulationSampleSize({ confidenceLevel: 95, marginOfError: 1, populationSize: 10_000, p: 0.001 });
    const rareHigh = calculateFinitePopulationSampleSize({ confidenceLevel: 95, marginOfError: 1, populationSize: 10_000, p: 0.999 });
    const conservative = calculateFinitePopulationSampleSize({ confidenceLevel: 95, marginOfError: 1, populationSize: 10_000, p: 0.5 });
    expect(rareLow).toBe(rareHigh);
    expect(conservative).toBeGreaterThan(rareLow!);
});

test("every advanced planning tool declares estimand, assumptions/source, scope, and limitations", () => {
    expect(ADVANCED_TAB_CONFIG.length).toBeGreaterThan(0);
    for (const tool of ADVANCED_TAB_CONFIG) {
        expect(tool.targetEstimand.trim().length).toBeGreaterThan(10);
        expect(tool.assumptionsAndSource.trim().length).toBeGreaterThan(10);
        expect(tool.scopeAndLimitations.trim().length).toBeGreaterThan(10);
    }
});
