import { expect, test } from "bun:test";
import {
    attachCalculatedSampleSize,
    calculateFinitePopulationSampleSize,
    calculateSampleSizeMetrics,
    calculateSampleSizeByCV,
    calculateClusterSamplingSize,
    calculateOptimalAllocationWithCost,
    calculateSquareRootAllocation,
    calculateSampleSizeForDifferentP,
    calculateSampleSizeSensitivity,
    calculateMeanEstimationSampleSize,
    calculateMeanSampleSizeMetrics,
    calculateSampleSizeStepDetails,
    calculateSampleSizeSteps,
    calculateSizeMeasureAllocation,
    calculateSqrtSizeMeasureAllocation,
    finitePopulationS2ToSigma2,
    finitePopulationVarianceFactor,
} from "./sample-plan";

test("basic sample size with 95% confidence and 5% margin", () => {
    const n = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    expect(n).toBeGreaterThan(200);
    expect(n).toBeLessThan(400);
});

test("design effect > 1 increases sample size without doubling after FPC", () => {
    const base = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    const withDeff = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
        designEffect: 2,
    });
    const n0 = 1.96 ** 2 * 0.25 / 0.05 ** 2;
    const expected = Math.ceil(2 * n0 * 1000 / (999 + 2 * n0));
    expect(withDeff).toBe(expected);
    expect(withDeff).toBeGreaterThan(base!);
    expect(withDeff).toBeLessThan(base! * 2);
});

test("non-response rate increases sample size", () => {
    const base = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    const withNRR = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
        nonResponseRate: 0.2,
    });
    // n / (1 - 0.2) = n / 0.8 = n * 1.25
    expect(withNRR).toBeGreaterThan(base!);
    expect(withNRR).toBeLessThanOrEqual(Math.ceil(base! / 0.8));
});

test("design effect and non-response rate combine multiplicatively", () => {
    const withBoth = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
        designEffect: 1.5,
        nonResponseRate: 0.1,
    });
    const base = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    expect(withBoth).toBeGreaterThan(base!);
    const n0 = 1.96 ** 2 * 0.25 / 0.05 ** 2;
    const nFpc = (n0 * 1.5) * 1000 / (999 + n0 * 1.5);
    const expected = Math.ceil(nFpc / 0.9);
    expect(withBoth).toBe(expected);
});

test("returns null for invalid population size", () => {
    expect(calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 0,
    })).toBeNull();
    expect(calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: -10,
    })).toBeNull();
    expect(calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: NaN,
    })).toBeNull();
    expect(calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: null,
    })).toBeNull();
    expect(calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: undefined,
    })).toBeNull();
});

test("returns null for unsupported confidence level", () => {
    const result = calculateFinitePopulationSampleSize({
        confidenceLevel: "80",
        marginOfError: "5",
        populationSize: 1000,
    });
    expect(result).toBeNull();
});

test("N=200 deff=2 uses variance-equation sample size 159, not a census", () => {
    const n = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 200,
        designEffect: 2,
    });
    expect(n).toBe(159);

    const metrics = calculateSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 200,
        designEffect: 2,
    });
    expect(metrics?.n).toBe(159);
    expect(metrics?.cappedAtPopulation).toBe(false);
    expect(metrics?.precisionUnreachable).toBe(false);
    expect(metrics?.marginOfError).toBeCloseTo(0.05, 3);

    const steps = calculateSampleSizeSteps({
        estimationType: "proportion",
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 200,
        designEffect: 2,
        nonResponseRate: 0,
    });
    expect(steps.n3).toBe(159);
    expect(steps.n1).toBeGreaterThan(steps.n2);
    expect(steps.n2).toBe(159);
});

test("N=200 NRR=50% caps invitations at 200 and shows unreachable 5% ME", () => {
    const metrics = calculateSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 200,
        designEffect: 1,
        nonResponseRate: 0.5,
    });
    expect(metrics?.n).toBe(200);
    expect(metrics?.cappedAtPopulation).toBe(true);
    expect(metrics?.expectedCompleted).toBe(100);
    expect(metrics?.precisionUnreachable).toBe(true);
    expect(metrics?.marginOfError).toBeCloseTo(1.96 * Math.sqrt(0.25 / 100 * 100 / 199), 4);
});

test("mean recommended sample size is capped at the population size", () => {
    const n = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 1,
        populationSize: 80,
        populationVariance: 400,
        designEffect: 2,
        nonResponseRate: 0.2,
    });
    expect(n).toBe(80);

    const metrics = calculateMeanSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: 1,
        populationSize: 80,
        populationVariance: 400,
        designEffect: 2,
        nonResponseRate: 0.2,
    });
    expect(metrics?.n).toBe(80);
    expect(metrics?.cappedAtPopulation).toBe(true);
});

test("deff = 1 does not change the result", () => {
    const base = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
    });
    const withDeff1 = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 1000,
        designEffect: 1,
    });
    expect(withDeff1).toBe(base);
});

// ========== calculateSampleSizeMetrics tests ==========

test("finite population variance factor uses the exact denominator-N convention", () => {
    expect(finitePopulationVarianceFactor(60, 53)).toBeCloseTo(7 / 59, 14);
    expect(finitePopulationVarianceFactor(60, 60)).toBe(0);
});

test("finite-population S² is converted from denominator N−1 to denominator N", () => {
    expect(finitePopulationS2ToSigma2(50, 24)).toBeCloseTo(47.916666666666664, 14);
    expect(finitePopulationS2ToSigma2(67.128040201005, 200)).toBeCloseTo(66.7924, 10);
    expect(finitePopulationS2ToSigma2(-1, 200)).toBeNull();
});

test("metrics SE includes finite population correction", () => {
    const metrics = calculateSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 1000,
    });
    expect(metrics).not.toBeNull();
    const p = 0.5;
    const effectiveN = metrics!.expectedCompleted;
    const seWithoutFPC = Math.sqrt(p * (1 - p) / effectiveN);
    const expected = Math.sqrt(p * (1 - p) / effectiveN * ((1000 - effectiveN) / 999));
    expect(metrics!.standardError).toBeCloseTo(expected, 14);
    expect(metrics!.standardError).toBeLessThan(seWithoutFPC);
    expect(metrics!.standardError).toBeGreaterThan(0);
});

test("metrics returns valid confidence interval", () => {
    const metrics = calculateSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 10000,
    });
    expect(metrics).not.toBeNull();
    expect(metrics!.confidenceInterval.lower).toBeGreaterThanOrEqual(0);
    expect(metrics!.confidenceInterval.upper).toBeLessThanOrEqual(1);
    expect(metrics!.confidenceInterval.lower).toBeLessThan(metrics!.confidenceInterval.upper);
});

test("metrics RSE equals SE / p", () => {
    const metrics = calculateSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 5000,
        p: 0.3,
    });
    expect(metrics).not.toBeNull();
    const expectedRSE = metrics!.standardError / 0.3;
    expect(Math.abs(metrics!.relativeStandardError - expectedRSE)).toBeLessThan(1e-10);
});

test("metrics returns null for invalid population", () => {
    expect(calculateSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 0,
    })).toBeNull();
});

// ========== calculateSampleSizeByCV tests ==========

test("CV-based sample size returns valid result", () => {
    const result = calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 10000,
        estimatedCV: 0.3,
    });
    expect(result).not.toBeNull();
    expect(result!.requiredSampleSize).toBeGreaterThan(0);
    expect(result!.requiredSampleSize).toBeLessThanOrEqual(10000);
    expect(result!.achievedCV).toBeGreaterThan(0);
});

test("CV-based sample size capped at population size is zero only with complete response", () => {
    const result = calculateSampleSizeByCV({
        confidenceLevel: "99",
        targetCV: 0.001,
        populationSize: 100,
        estimatedCV: 0.5,
    });
    expect(result).not.toBeNull();
    expect(result!.requiredSampleSize).toBe(100);
    expect(result!.expectedRespondentSampleSize).toBe(100);
    expect(result!.achievedCV).toBe(0);
});

test("CV-based full-population invitation retains uncertainty when nonresponse is expected", () => {
    const result = calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 100,
        estimatedCV: 0.5,
        designEffect: 2,
        nonResponseRate: 0.5,
    });
    expect(result).not.toBeNull();
    expect(result!.requiredSampleSize).toBe(100);
    expect(result!.expectedRespondentSampleSize).toBe(50);
    expect(result!.cappedAtPopulation).toBe(true);
    expect(result!.achievedCV).toBeCloseTo(0.07106690545187015, 12);
});

test("CV-based achievedCV approximates targetCV by construction", () => {
    const result = calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 10000,
        estimatedCV: 0.3,
    });
    expect(result).not.toBeNull();
    // The sample size is designed to achieve targetCV, so achievedCV ≈ targetCV
    expect(Math.abs(result!.achievedCV - 0.05)).toBeLessThan(0.005);
});

test("CV-based achievedCV approximates targetCV for small population", () => {
    const result = calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 200,
        estimatedCV: 0.3,
    });
    expect(result).not.toBeNull();
    // Even with strong FPC, achievedCV should still approximate targetCV
    expect(Math.abs(result!.achievedCV - 0.05)).toBeLessThan(0.005);
});

test("CV-based achievedCV follows correct formula", () => {
    const result = calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 5000,
        estimatedCV: 0.4,
        designEffect: 1.5,
        nonResponseRate: 0.1,
    });
    expect(result).not.toBeNull();
    const expectedRespondents = result!.requiredSampleSize * 0.9;
    const fpc = (5000 - expectedRespondents) / (5000 - 1);
    // achievedCV = CV_pop × √(deff × FPC / expected respondents)  (no z factor)
    const expectedCV = 0.4 * Math.sqrt(1.5 * fpc / expectedRespondents);
    expect(Math.abs(result!.achievedCV - expectedCV)).toBeLessThan(1e-10);
});

test("CV-based returns null for invalid params", () => {
    expect(calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0,
        populationSize: 1000,
    })).toBeNull();
    expect(calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 0,
    })).toBeNull();
    expect(calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: NaN,
    })).toBeNull();
    expect(calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: NaN,
        populationSize: 1000,
    })).toBeNull();
});

test("CV-based returns null when nonResponseRate >= 1 (division by zero guard)", () => {
    expect(calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 1000,
        nonResponseRate: 1,
    })).toBeNull();
    expect(calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 1000,
        nonResponseRate: 1.5,
    })).toBeNull();
    expect(calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 1000,
        nonResponseRate: -0.1,
    })).toBeNull();
    expect(calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 1000,
        estimatedCV: 0,
    })).toBeNull();
    expect(calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 1000,
        designEffect: 0,
    })).toBeNull();
});

test("CV-based base formula is n₀ = CV_pop² / targetCV² (no z factor)", () => {
    // With very large population (negligible FPC), deff=1, nrr=0,
    // the result should approximate CV_pop² / targetCV²
    const result = calculateSampleSizeByCV({
        confidenceLevel: "95",
        targetCV: 0.05,
        populationSize: 1_000_000,
        estimatedCV: 0.3,
    });
    expect(result).not.toBeNull();
    // n₀ = 0.3² / 0.05² = 0.09 / 0.0025 = 36
    expect(result!.requiredSampleSize).toBe(36);
});

test("CV-based: Z 随置信水平变化；requiredSampleSize 与 confidenceLevel 无关", () => {
    const base = {
        targetCV: 0.05,
        populationSize: 10000,
        estimatedCV: 0.3,
        designEffect: 1,
        nonResponseRate: 0,
    };
    const r90 = calculateSampleSizeByCV({ ...base, confidenceLevel: "90" });
    const r99 = calculateSampleSizeByCV({ ...base, confidenceLevel: "99" });
    expect(r90).not.toBeNull();
    expect(r99).not.toBeNull();
    expect(r90!.requiredSampleSize).toBe(r99!.requiredSampleSize);
    expect(r90!.achievedCV).toBeCloseTo(r99!.achievedCV!, 10);
    expect(r90!.z).toBe(1.645);
    expect(r99!.z).toBe(2.576);
    // UI「Z×CV」行会随置信水平变化
    expect(r90!.z * r90!.achievedCV).not.toBeCloseTo(r99!.z * r99!.achievedCV!, 6);
});

// ========== calculateClusterSamplingSize tests ==========

test("cluster sampling includes finite population correction", () => {
    const result = calculateClusterSamplingSize({
        populationSize: 1000,
        confidenceLevel: "95",
        marginOfError: 5,
        clusterSize: 50,
        deff: 2.0,
    });
    expect(result).not.toBeNull();
    expect(result!.requiredClusters).toBeGreaterThan(0);
    expect(result!.requiredSampleSize).toBeGreaterThan(0);
    // With deff=2, cluster sample should be larger than SRS
    const srs = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 1000,
    });
    expect(result!.requiredSampleSize).toBeGreaterThan(srs!);
});

test("cluster sampling intra-class correlation in valid range", () => {
    const result = calculateClusterSamplingSize({
        populationSize: 10000,
        confidenceLevel: "95",
        marginOfError: 5,
        clusterSize: 30,
        deff: 1.5,
    });
    expect(result).not.toBeNull();
    expect(result!.intraClassCorrelation).toBeGreaterThanOrEqual(0);
    expect(result!.intraClassCorrelation).toBeLessThanOrEqual(1);
});

test("cluster sampling returns null for invalid params", () => {
    expect(calculateClusterSamplingSize({
        populationSize: 0,
        confidenceLevel: "95",
        marginOfError: 5,
        clusterSize: 50,
        deff: 2.0,
    })).toBeNull();
});

test("cluster sampling treats marginOfError=1 as 1% (not 100%)", () => {
    // Regression: marginOfError=1 was passed through as 1.0 (100%) due to `> 1` check
    const result = calculateClusterSamplingSize({
        populationSize: 10000,
        confidenceLevel: "95",
        marginOfError: 1,
        clusterSize: 30,
        deff: 2.0,
    });
    expect(result).not.toBeNull();
    // With 1% margin of error, we need a VERY large sample
    // (much larger than with 5% margin). If the bug were still present,
    // e=1.0 would give n≈1 (trivial sample).
    expect(result!.requiredSampleSize).toBeGreaterThan(1000);
});

test("cluster sampling: 置信水平影响所需样本量", () => {
    const base = {
        populationSize: 10000,
        marginOfError: 5,
        clusterSize: 50,
        deff: 2.0,
        nonResponseRate: 0,
    };
    const lo = calculateClusterSamplingSize({ ...base, confidenceLevel: "90" });
    const hi = calculateClusterSamplingSize({ ...base, confidenceLevel: "99" });
    expect(lo).not.toBeNull();
    expect(hi).not.toBeNull();
    expect(hi!.requiredSampleSize).toBeGreaterThan(lo!.requiredSampleSize);
});

// ========== calculateOptimalAllocationWithCost tests ==========

test("optimal allocation with cost produces valid result", () => {
    const result = calculateOptimalAllocationWithCost(
        [
            { name: "Layer A", populationSize: 500, stdDev: 10, unitCost: 20 },
            { name: "Layer B", populationSize: 300, stdDev: 15, unitCost: 50 },
            { name: "Layer C", populationSize: 200, stdDev: 8, unitCost: 30 },
        ],
        50000,
        5000,
    );
    expect(result).not.toBeNull();
    expect(result!.totalSampleSize).toBeGreaterThan(0);
    expect(result!.totalCost).toBeLessThanOrEqual(50000);
    expect(result!.allocation.length).toBe(3);
});

test("optimal allocation follows n_h ∝ N_h S_h / √c_h when caps do not bind", () => {
    const result = calculateOptimalAllocationWithCost(
        [
            { name: "Cheap", populationSize: 5000, stdDev: 10, unitCost: 1 },
            { name: "Expensive", populationSize: 5000, stdDev: 10, unitCost: 4 },
        ],
        900,
        0,
    );
    expect(result).not.toBeNull();
    // Closed form: n_h = C w_h / Σ(w_i c_i) → n1=300, n2=150, ratio 2:1
    expect(result!.allocation[0]!.sampleSize).toBe(300);
    expect(result!.allocation[1]!.sampleSize).toBe(150);
    expect(result!.allocation[0]!.sampleSize / result!.allocation[1]!.sampleSize).toBeCloseTo(2, 5);
    expect(result!.totalCost).toBeLessThanOrEqual(900);
    expect(result!.formula).toContain("C ×");
});

test("optimal allocation returns null for insufficient budget", () => {
    const result = calculateOptimalAllocationWithCost(
        [{ name: "A", populationSize: 100, stdDev: 10, unitCost: 20 }],
        100,
        100,
    );
    expect(result).toBeNull();
});

// ========== calculateSquareRootAllocation tests ==========

test("square root allocation sums to total exactly", () => {
    const allocation = calculateSquareRootAllocation(
        [
            { name: "A", populationSize: 1000 },
            { name: "B", populationSize: 250 },
            { name: "C", populationSize: 100 },
        ],
        100,
    );
    const total = allocation.reduce((s, a) => s + a.sampleSize, 0);
    // Largest remainder method guarantees exact sum
    expect(total).toBe(100);
    // Larger layers get more but not proportional
    expect(allocation[0]!.sampleSize).toBeGreaterThan(allocation[2]!.sampleSize);
});

test("square root allocation returns empty for no layers", () => {
    expect(calculateSquareRootAllocation([], 100)).toEqual([]);
});

// ========== calculateSampleSizeForDifferentP tests ==========

test("p=0.5 gives largest sample size", () => {
    const results = calculateSampleSizeForDifferentP({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 5000,
    });
    expect(results.length).toBe(4);
    const p05 = results.find(r => r.p === 0.5);
    expect(p05).toBeDefined();
    for (const r of results) {
        expect(r.sampleSize).toBeLessThanOrEqual(p05!.sampleSize);
    }
});

// ========== calculateSampleSizeSensitivity tests ==========

test("sensitivity matrix covers all combinations", () => {
    const matrix = calculateSampleSizeSensitivity({ populationSize: 10000 });
    expect(matrix).not.toBeNull();
    // 3 confidence levels × 6 margin of errors = 18
    expect(matrix!.length).toBe(18);
});

test("sensitivity: higher confidence or lower margin -> larger sample", () => {
    const matrix = calculateSampleSizeSensitivity({ populationSize: 10000 });
    expect(matrix).not.toBeNull();
    // 99% confidence should require more than 90% at same margin
    const n99_5 = matrix!.find(m => m.confidenceLevel === "99" && m.marginOfError === 5);
    const n90_5 = matrix!.find(m => m.confidenceLevel === "90" && m.marginOfError === 5);
    expect(n99_5!.sampleSize).toBeGreaterThan(n90_5!.sampleSize);
    // 1% margin should require more than 10% at same confidence
    const n95_1 = matrix!.find(m => m.confidenceLevel === "95" && m.marginOfError === 1);
    const n95_10 = matrix!.find(m => m.confidenceLevel === "95" && m.marginOfError === 10);
    expect(n95_1!.sampleSize).toBeGreaterThan(n95_10!.sampleSize);
});

// ========== calculateMeanEstimationSampleSize tests ==========

test("mean estimation: basic sample size calculation", () => {
    // n0 = Z² × σ² / e² = 1.96² × 100 / 4 = 96.04 → with FPC for N=1000
    const n = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 1000,
        populationVariance: 100,
    });
    expect(n).not.toBeNull();
    expect(n!).toBeGreaterThan(50);
    expect(n!).toBeLessThan(200);
});

test("mean estimation: larger variance increases sample size", () => {
    const nSmall = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 5000,
        populationVariance: 50,
    });
    const nLarge = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 5000,
        populationVariance: 200,
    });
    expect(nSmall).not.toBeNull();
    expect(nLarge).not.toBeNull();
    expect(nLarge!).toBeGreaterThan(nSmall!);
});

test("mean estimation: deff and NRR adjust multiplicatively", () => {
    const base = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 10000,
        populationVariance: 100,
    });
    const adjusted = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 10000,
        populationVariance: 100,
        designEffect: 2,
        nonResponseRate: 0.1,
    });
    expect(base).not.toBeNull();
    expect(adjusted).not.toBeNull();
    expect(adjusted!).toBeGreaterThan(base!);
    const n0 = 1.96 ** 2 * 100 / 4;
    const nFpc = (n0 * 2) * 10000 / (9999 + n0 * 2);
    expect(adjusted).toBe(Math.ceil(nFpc / 0.9));
});

test("mean estimation: returns null for invalid inputs", () => {
    expect(calculateMeanEstimationSampleSize({
        confidenceLevel: "95", marginOfError: 2,
        populationSize: 0, populationVariance: 100,
    })).toBeNull();
    expect(calculateMeanEstimationSampleSize({
        confidenceLevel: "95", marginOfError: 2,
        populationSize: 1000, populationVariance: 0,
    })).toBeNull();
    expect(calculateMeanEstimationSampleSize({
        confidenceLevel: "95", marginOfError: 0,
        populationSize: 1000, populationVariance: 100,
    })).toBeNull();
    expect(calculateMeanEstimationSampleSize({
        confidenceLevel: "80", marginOfError: 2,
        populationSize: 1000, populationVariance: 100,
    })).toBeNull();
});

test("mean estimation: infinite population approaches n0 = Z²σ²/e²", () => {
    const n = calculateMeanEstimationSampleSize({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 10_000_000,
        populationVariance: 100,
    });
    // n0 = 1.96² × 100 / 4 = 96.04 → ceil = 97
    expect(n).toBe(97);
});

// ========== calculateMeanSampleSizeMetrics tests ==========

test("mean metrics: returns valid SE and confidence interval", () => {
    const metrics = calculateMeanSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 5000,
        populationVariance: 100,
        estimatedMean: 50,
    });
    expect(metrics).not.toBeNull();
    expect(metrics!.standardError).toBeGreaterThan(0);
    expect(metrics!.confidenceInterval.lower).toBeLessThan(50);
    expect(metrics!.confidenceInterval.upper).toBeGreaterThan(50);
});

test("mean metrics: RSE = SE / |mean|", () => {
    const metrics = calculateMeanSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 5000,
        populationVariance: 100,
        estimatedMean: 50,
    });
    expect(metrics).not.toBeNull();
    expect(Math.abs(metrics!.relativeStandardError - metrics!.standardError / 50)).toBeLessThan(1e-10);
});

// ========== calculateSizeMeasureAllocation tests ==========

test("size measure allocation sums to total exactly", () => {
    const alloc = calculateSizeMeasureAllocation(
        [
            { name: "Urban", populationSize: 500, sizeMeasure: 1000 },
            { name: "Suburban", populationSize: 300, sizeMeasure: 600 },
            { name: "Rural", populationSize: 200, sizeMeasure: 200 },
        ],
        100,
    );
    expect(alloc.length).toBe(3);
    const total = alloc.reduce((s, a) => s + a.sampleSize, 0);
    expect(total).toBe(100);
});

test("size measure allocation: larger Nh×Yh gets more samples", () => {
    const alloc = calculateSizeMeasureAllocation(
        [
            { name: "A", populationSize: 100, sizeMeasure: 10 },
            { name: "B", populationSize: 100, sizeMeasure: 100 },
        ],
        100,
    );
    expect(alloc[1]!.sampleSize).toBeGreaterThan(alloc[0]!.sampleSize);
});

test("size measure allocation: empty layers returns empty", () => {
    expect(calculateSizeMeasureAllocation([], 100)).toEqual([]);
});

// ========== calculateSqrtSizeMeasureAllocation tests ==========

test("sqrt size measure allocation sums to total exactly", () => {
    const alloc = calculateSqrtSizeMeasureAllocation(
        [
            { name: "Urban", populationSize: 500, sizeMeasure: 1000 },
            { name: "Suburban", populationSize: 300, sizeMeasure: 600 },
            { name: "Rural", populationSize: 200, sizeMeasure: 200 },
        ],
        100,
    );
    expect(alloc.length).toBe(3);
    const total = alloc.reduce((s, a) => s + a.sampleSize, 0);
    expect(total).toBe(100);
});

test("sqrt allocation gives more balanced distribution than linear", () => {
    const layers = [
        { name: "A", populationSize: 100, sizeMeasure: 10 },
        { name: "B", populationSize: 100, sizeMeasure: 1000 },
    ];
    const linear = calculateSizeMeasureAllocation(layers, 100);
    const sqrt = calculateSqrtSizeMeasureAllocation(layers, 100);
    // sqrt should give "A" a larger share compared to linear
    expect(sqrt[0]!.sampleSize).toBeGreaterThan(linear[0]!.sampleSize);
});

test("attachCalculatedSampleSize uses mean formula when estimationType=mean", () => {
    const attached = attachCalculatedSampleSize({
        estimationType: "mean",
        confidenceLevel: "95",
        marginOfError: 2,
        populationVariance: 100,
        designEffect: 1,
        nonResponseRate: 0,
    }, 5000);

    expect(attached.calculatedSampleSize).toBe(
        calculateMeanEstimationSampleSize({
            confidenceLevel: "95",
            marginOfError: 2,
            populationSize: 5000,
            populationVariance: 100,
            designEffect: 1,
            nonResponseRate: 0,
        }),
    );
});

test("attachCalculatedSampleSize keeps proportion formula as default", () => {
    const attached = attachCalculatedSampleSize({
        confidenceLevel: "95",
        marginOfError: 5,
        designEffect: 1,
        nonResponseRate: 0,
    }, 1000);

    expect(attached.calculatedSampleSize).toBe(
        calculateFinitePopulationSampleSize({
            confidenceLevel: "95",
            marginOfError: 5,
            populationSize: 1000,
            designEffect: 1,
            nonResponseRate: 0,
        }),
    );
});

// ========== calculateSampleSizeSteps tests ==========

test("steps proportion: n3 matches the canonical formula", () => {
    const steps = calculateSampleSizeSteps({
        estimationType: "proportion",
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 1000,
        designEffect: 1.5,
        nonResponseRate: 0.1,
    });
    const canonical = calculateFinitePopulationSampleSize({
        confidenceLevel: "95", marginOfError: 5, populationSize: 1000,
        designEffect: 1.5, nonResponseRate: 0.1,
    })!;
    expect(steps.n3).toBe(canonical);
    expect(steps.n1).toBeGreaterThanOrEqual(steps.n0);
    expect(steps.n2).toBeLessThanOrEqual(steps.n1);
    expect(steps.n3).toBeGreaterThanOrEqual(steps.n2);
    expect(steps.formulaLabel).toBe("Z²p(1-p)/E²");
});

test("steps mean: n3 matches the canonical formula", () => {
    const steps = calculateSampleSizeSteps({
        estimationType: "mean",
        confidenceLevel: "95",
        marginOfError: 2,
        populationSize: 5000,
        populationVariance: 100,
        designEffect: 2,
        nonResponseRate: 0.15,
    });
    const canonical = calculateMeanEstimationSampleSize({
        confidenceLevel: "95", marginOfError: 2, populationSize: 5000,
        populationVariance: 100, designEffect: 2, nonResponseRate: 0.15,
    })!;
    expect(steps.n3).toBe(canonical);
    expect(steps.formulaLabel).toBe("Z²σ²/e²");
});

test("steps: returns zeros for invalid inputs", () => {
    const steps = calculateSampleSizeSteps({
        estimationType: "proportion",
        confidenceLevel: "95",
        marginOfError: 0,
        populationSize: 1000,
        designEffect: 1,
        nonResponseRate: 0,
    });
    expect(steps.n0).toBe(0);
    expect(steps.n3).toBe(0);
});

test("step details expose raw values consistent with canonical formulas", () => {
    const details = calculateSampleSizeStepDetails({
        estimationType: "proportion",
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 8000,
        designEffect: 1,
        nonResponseRate: 0,
    });

    expect(details.n0Raw).toBeCloseTo(384.16, 2);
    expect(details.n1Raw).toBeCloseTo(384.16, 2);
    expect(details.n2Raw).toBeCloseTo(366.60, 2);
    expect(details.n0).toBe(385);
    expect(details.n2).toBe(367);
});
