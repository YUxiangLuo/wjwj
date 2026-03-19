import { expect, test } from "bun:test";
import {
    calculateFinitePopulationSampleSize,
    calculateSampleSizeMetrics,
    calculateSampleSizeByCV,
    calculateClusterSamplingSize,
    calculateOptimalAllocationWithCost,
    calculateSquareRootAllocation,
    calculateSampleSizeForDifferentP,
    calculateSampleSizeSensitivity,
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

test("design effect > 1 increases sample size", () => {
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
    expect(withDeff).toBe(base! * 2);
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
    // Result should be close to base * 1.5 / 0.9, within ±1 due to ceil rounding
    const expected = Math.ceil(base! * 1.5 / 0.9);
    expect(Math.abs(withBoth! - expected)).toBeLessThanOrEqual(1);
});

test("returns null for invalid population size", () => {
    const result = calculateFinitePopulationSampleSize({
        confidenceLevel: "95",
        marginOfError: "5",
        populationSize: 0,
    });
    expect(result).toBeNull();
});

test("returns null for unsupported confidence level", () => {
    const result = calculateFinitePopulationSampleSize({
        confidenceLevel: "80",
        marginOfError: "5",
        populationSize: 1000,
    });
    expect(result).toBeNull();
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

test("metrics SE includes finite population correction", () => {
    const metrics = calculateSampleSizeMetrics({
        confidenceLevel: "95",
        marginOfError: 5,
        populationSize: 1000,
    });
    expect(metrics).not.toBeNull();
    // SE with FPC should be smaller than SE without FPC
    const p = 0.5;
    const n = metrics!.n1;
    const seWithoutFPC = Math.sqrt(p * (1 - p) / Math.ceil(n));
    expect(metrics!.standardError).toBeLessThan(seWithoutFPC);
    // SE should be positive
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

test("CV-based sample size capped at population size", () => {
    const result = calculateSampleSizeByCV({
        confidenceLevel: "99",
        targetCV: 0.001,
        populationSize: 100,
        estimatedCV: 0.5,
    });
    expect(result).not.toBeNull();
    expect(result!.requiredSampleSize).toBeLessThanOrEqual(100);
    // When capped, achievedCV should be 0 (census)
    expect(result!.achievedCV).toBe(0);
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
    const n = result!.requiredSampleSize;
    const fpc = 1 - n / 5000;
    // achievedCV = z × CV_pop × √(deff × fpc / (n × (1 - nrr)))
    const expectedCV = 1.96 * 0.4 * Math.sqrt(1.5 * fpc / (n * 0.9));
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
