import { expect, test } from "bun:test";
import { truncateCategoricalDistributions } from "./distributions";
import { calculateUnivariate } from "../variables/analysis";
import { calculateDesignWeights } from "../variables/design-weights";
import type { VariableDefinition } from "../variables/types";
import {
    calculateClusterSamplingSize,
    calculateFinitePopulationSampleSize,
    calculateSampleSizeMetrics,
    calculateSizeMeasureAllocation,
    calculateSqrtSizeMeasureAllocation,
    calculateSquareRootAllocation,
} from "../../student/experiment/sample-plan";

const continuous: VariableDefinition = {
    field: "x", label: "值", unit: "", kind: "continuous", categories: [], missing: [],
};

test("proportion planning rejects non-finite or out-of-domain parameters", () => {
    const base = { confidenceLevel: "95", marginOfError: 5, populationSize: 100 };
    for (const marginOfError of [0, -1, 100, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(calculateFinitePopulationSampleSize({ ...base, marginOfError })).toBeNull();
        expect(calculateSampleSizeMetrics({ ...base, marginOfError })).toBeNull();
    }
    for (const p of [0, 1, -0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(calculateFinitePopulationSampleSize({ ...base, p })).toBeNull();
        expect(calculateSampleSizeMetrics({ ...base, p })).toBeNull();
    }
    for (const designEffect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(calculateFinitePopulationSampleSize({ ...base, designEffect })).toBeNull();
        expect(calculateSampleSizeMetrics({ ...base, designEffect })).toBeNull();
    }
    for (const nonResponseRate of [-0.01, 1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(calculateFinitePopulationSampleSize({ ...base, nonResponseRate })).toBeNull();
        expect(calculateSampleSizeMetrics({ ...base, nonResponseRate })).toBeNull();
    }
    for (const populationSize of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(calculateFinitePopulationSampleSize({ ...base, populationSize })).toBeNull();
        expect(calculateSampleSizeMetrics({ ...base, populationSize })).toBeNull();
    }
});

test("proportion planning is symmetric in p and monotone in precision and confidence", () => {
    const sampleSize = (p: number, marginOfError = 5, confidenceLevel = "95") =>
        calculateFinitePopulationSampleSize({ populationSize: 10_000, confidenceLevel, marginOfError, p })!;
    for (const p of [0.01, 0.1, 0.25, 0.4]) {
        expect(sampleSize(p)).toBe(sampleSize(1 - p));
        expect(sampleSize(p)).toBeLessThanOrEqual(sampleSize(0.5));
    }
    for (const p of [0.01, 0.1, 0.5, 0.9, 0.99]) {
        expect(sampleSize(p, 2)).toBeGreaterThanOrEqual(sampleSize(p, 5));
        expect(sampleSize(p, 5, "99")).toBeGreaterThanOrEqual(sampleSize(p, 5, "95"));
        expect(sampleSize(p, 5, "95")).toBeGreaterThanOrEqual(sampleSize(p, 5, "90"));
    }
});

test("cluster planning rejects parameters that cannot define a finite sampling design", () => {
    const base = { populationSize: 100, confidenceLevel: "95", marginOfError: 5, clusterSize: 10, deff: 1.5 };
    for (const patch of [
        { marginOfError: 0 }, { marginOfError: Number.NaN }, { marginOfError: 100 },
        { confidenceLevel: "80" }, { populationSize: 1.5 }, { clusterSize: 1.5 },
        { deff: 0 }, { deff: Number.POSITIVE_INFINITY }, { nonResponseRate: 1 },
        { p: 0 }, { p: 1 }, { p: -0.1 }, { p: 1.1 }, { deff: 11.01 },
    ]) {
        expect(calculateClusterSamplingSize({ ...base, ...patch })).toBeNull();
    }
    expect(calculateClusterSamplingSize({ ...base, clusterSize: 1, deff: 2 })).toBeNull();
    expect(calculateClusterSamplingSize({ ...base, clusterSize: 1, deff: 1 })).not.toBeNull();
});

test("cluster planning uses the actual SRSWOR variance ratio, checked by complete enumeration", () => {
    const successes = [0, 5, 5, 5, 5, 5, 5, 5, 5, 10];
    const margins = new Map<number, number>();
    for (const count of [6, 7, 8]) {
        let squaredErrors = 0, outcomes = 0;
        for (let mask = 0; mask < 1024; mask++) {
            const selected = successes.filter((_, index) => mask & (1 << index));
            if (selected.length !== count) continue;
            const estimate = selected.reduce((sum, value) => sum + value, 0) / (count * 10);
            squaredErrors += (estimate - 0.5) ** 2;
            outcomes++;
        }
        margins.set(count, 1.96 * Math.sqrt(squaredErrors / outcomes));
    }
    expect(margins.get(6)!).toBeGreaterThan(0.1);
    expect(margins.get(7)!).toBeLessThan(0.1);
    // Enumerated cluster variance / SRSWOR variance at n=70 is exactly 2.2.
    expect((margins.get(7)! / 1.96) ** 2 / (0.25 / 70 * 30 / 99)).toBeCloseTo(2.2, 12);
    const result = calculateClusterSamplingSize({
        populationSize: 100, confidenceLevel: "95", marginOfError: 10, clusterSize: 10, deff: 2.2,
    })!;
    expect(result.requiredClusters).toBe(7);
    expect(result.requiredSampleSize).toBe(70);
    expect(result.marginOfError).toBeCloseTo(margins.get(7)!, 12);
    expect(result.intraClassCorrelation!).toBeCloseTo(1 / 9, 12);
});

test("within-cluster nonresponse matches all 10000 respondent samples", () => {
    const groups = [2, 4, 6, 8].map(count => Array.from({ length: 10 }, (_, index) => Number(index < count)));
    let squaredErrors = 0;
    for (const a of groups[0]!) for (const b of groups[1]!) for (const c of groups[2]!) for (const d of groups[3]!) {
        squaredErrors += ((20 - a - b - c - d) / 36 - 0.5) ** 2;
    }
    const margin = 1.96 * Math.sqrt(squaredErrors / 10000);
    // Full-response cluster variance relative to SRSWOR is 2.6 (ICC moment multiplier is 2).
    for (const target of [4, 5, 8]) {
        const result = calculateClusterSamplingSize({
            populationSize: 40, confidenceLevel: "95", marginOfError: target,
            clusterSize: 10, deff: 2.6, nonResponseRate: 0.1,
        })!;
        expect(result.requiredClusters).toBe(4);
        expect(result.marginOfError).toBeCloseTo(margin, 12);
        expect(result.precisionUnreachable).toBe(target === 4);
    }
});

test("cluster moment bounds, partial clusters and singleton frames are explicit", () => {
    const base = { populationSize: 100, confidenceLevel: "95", marginOfError: 5, clusterSize: 10, deff: 10.5 };
    expect(calculateClusterSamplingSize(base)).not.toBeNull();
    expect(calculateClusterSamplingSize({ ...base, deff: 11 })!.intraClassCorrelation).toBeCloseTo(1, 12);
    expect(calculateClusterSamplingSize({ ...base, populationSize: 60, clusterSize: 15, deff: 59 / 3 })!.intraClassCorrelation).toBe(1);
    expect(calculateClusterSamplingSize({ ...base, deff: 11.01 })).toBeNull();
    const partial = calculateClusterSamplingSize({ ...base, populationSize: 95, deff: 2 })!;
    expect(partial.intraClassCorrelation).toBeNull();
    expect(partial.explanation).toContain("平均群规模");
    for (const deff of [1, 2, 5]) {
        const single = calculateClusterSamplingSize({ ...base, populationSize: 40, clusterSize: 50, deff, nonResponseRate: 0.1 })!;
        expect(single.requiredSampleSize).toBe(40);
        expect(single.intraClassCorrelation).toBeNull();
        expect(single.marginOfError).toBeCloseTo(1.96 * Math.sqrt(0.1 * 0.25 / (39 * 0.9)), 12);
    }
    expect(calculateClusterSamplingSize({ ...base, populationSize: 1, nonResponseRate: 0.1 })).toBeNull();
    expect(calculateClusterSamplingSize({ ...base, populationSize: 1 })!.marginOfError).toBe(0);
    expect(calculateClusterSamplingSize({ ...base, nonResponseRate: 0.95 })).toBeNull();
    const units = calculateClusterSamplingSize({ ...base, clusterSize: 1, deff: 1, nonResponseRate: 0.1, marginOfError: 1 })!;
    expect(units.intraClassCorrelation).toBeNull();
    expect(units.marginOfError).toBeCloseTo(1.96 * Math.sqrt(0.25 / 90 * 10 / 99), 12);
});

test("both sampling stages contribute with an asymmetric proportion and a non-census sample", () => {
    const successes = [0, 1, 2, 3, 4, 5, 6, 3, 3, 3];
    const variances = new Map<number, number>();
    for (const count of [5, 6]) {
        let squaredErrors = 0, samples = 0, fullResponseVariance = 0;
        for (let mask = 0; mask < 1024; mask++) {
            const selected = successes.filter((_, index) => mask & (1 << index));
            if (selected.length !== count) continue;
            const total = selected.reduce((sum, value) => sum + value, 0);
            fullResponseVariance += (total / (count * 10) - 0.3) ** 2;
            samples++;
            // Each cluster omits one random person. Enumerate the omitted binary values,
            // weighting by their exact probabilities instead of simulating respondents.
            for (let omitted = 0; omitted < 1 << count; omitted++) {
                let probability = 1, missingSuccesses = 0;
                selected.forEach((successes, index) => {
                    const success = Number(Boolean(omitted & (1 << index)));
                    probability *= success ? successes / 10 : 1 - successes / 10;
                    missingSuccesses += success;
                });
                squaredErrors += probability * ((total - missingSuccesses) / (count * 9) - 0.3) ** 2;
            }
        }
        expect((fullResponseVariance / samples) / (0.21 / (count * 10) * (100 - count * 10) / 99)).toBeCloseTo(22 / 15, 12);
        variances.set(count, squaredErrors / samples);
    }
    expect(1.96 * Math.sqrt(variances.get(5)!)).toBeGreaterThan(0.1);
    expect(1.96 * Math.sqrt(variances.get(6)!)).toBeLessThan(0.1);
    const result = calculateClusterSamplingSize({
        populationSize: 100, clusterSize: 10, deff: 22 / 15, p: 0.3,
        confidenceLevel: "95", marginOfError: 10, nonResponseRate: 0.1,
    })!;
    expect(result.requiredClusters).toBe(6);
    expect(result.marginOfError).toBeCloseTo(1.96 * Math.sqrt(variances.get(6)!), 12);
});

test("allocation is invariant to common scaling and preserves totals over extreme weight ratios", () => {
    for (const scale of [1, 1e-310, 1e300]) {
        const layers = [1, 1].map((sizeMeasure, index) => ({ name: String(index), populationSize: 100, sizeMeasure: sizeMeasure * scale }));
        expect(calculateSizeMeasureAllocation(layers, 50).map(layer => layer.sampleSize)).toEqual([25, 25]);
        expect(calculateSqrtSizeMeasureAllocation(layers, 50).map(layer => layer.sampleSize)).toEqual([25, 25]);
    }
    for (const tiny of [1e-30, 1e-100, 1e-310]) {
        const layers = [1, tiny, 0].map((sizeMeasure, index) => ({ name: String(index), populationSize: 100, sizeMeasure }));
        expect(calculateSizeMeasureAllocation(layers, 50).map(layer => layer.sampleSize)).toEqual([48, 1, 1]);
        expect(calculateSizeMeasureAllocation(layers, 150).map(layer => layer.sampleSize)).toEqual([100, 49, 1]);
        expect(calculateSizeMeasureAllocation(layers, 250).map(layer => layer.sampleSize)).toEqual([100, 100, 50]);
    }
});

test("share-based allocations never sample more units than a stratum contains", () => {
    const capacities = [
        { name: "A", populationSize: 1 },
        { name: "B", populationSize: 2 },
        { name: "C", populationSize: 4 },
    ];
    const allocations = [
        calculateSquareRootAllocation(capacities, 20),
        calculateSizeMeasureAllocation(capacities.map((layer, index) => ({ ...layer, sizeMeasure: index + 1 })), 20),
        calculateSqrtSizeMeasureAllocation(capacities.map((layer, index) => ({ ...layer, sizeMeasure: index + 1 })), 20),
    ];
    for (const allocation of allocations) {
        expect(allocation.reduce((sum, layer) => sum + layer.sampleSize, 0)).toBe(7);
        for (const [index, layer] of allocation.entries()) {
            expect(layer.sampleSize).toBeLessThanOrEqual(capacities[index]!.populationSize);
            expect(layer.sampleSize).toBeGreaterThanOrEqual(0);
        }
    }
});

test("share-based allocation capacity invariants hold across a small exhaustive state space", () => {
    for (let a = 1; a <= 4; a += 1) for (let b = 1; b <= 4; b += 1) for (let c = 1; c <= 4; c += 1) {
        const layers = [a, b, c].map((populationSize, index) => ({ name: String(index), populationSize }));
        const capacity = a + b + c;
        for (let target = 0; target <= capacity + 2; target += 1) {
            const weightedLayers = layers.map((layer, index) => ({ ...layer, sizeMeasure: index + 1 }));
            const allocations = [
                calculateSquareRootAllocation(layers, target),
                calculateSizeMeasureAllocation(weightedLayers, target),
                calculateSqrtSizeMeasureAllocation(weightedLayers, target),
            ];
            for (const allocation of allocations) {
                expect(allocation.reduce((sum, layer) => sum + layer.sampleSize, 0)).toBe(Math.min(target, capacity));
                for (const [index, layer] of allocation.entries()) {
                    expect(Number.isSafeInteger(layer.sampleSize)).toBe(true);
                    expect(layer.sampleSize).toBeGreaterThanOrEqual(0);
                    expect(layer.sampleSize).toBeLessThanOrEqual(layers[index]!.populationSize);
                    if (target >= layers.length) expect(layer.sampleSize).toBeGreaterThanOrEqual(1);
                }
            }
        }
    }
});

test("capacity-constrained largest remainder preserves residual fractions and feasible stratum coverage", () => {
    const constrained = calculateSizeMeasureAllocation([
        { name: "A", populationSize: 2, sizeMeasure: 2.5 },
        { name: "B", populationSize: 100, sizeMeasure: 0.04 },
        { name: "C", populationSize: 100, sizeMeasure: 0.01 },
    ], 5);
    // 先保证各层一个单位后，剩余份额为 [1, 0.8, 0.2]，故整数结果为 [2, 2, 1]。
    expect(constrained.map((layer) => layer.sampleSize)).toEqual([2, 2, 1]);

    const covered = calculateSquareRootAllocation([
        { name: "大层", populationSize: 10_000 },
        { name: "小层", populationSize: 1 },
    ], 2);
    expect(covered.map((layer) => layer.sampleSize)).toEqual([1, 1]);
});

test("a nonbinding coverage floor preserves the requested allocation ratio", () => {
    const squareRoot = calculateSquareRootAllocation([
        { name: "A", populationSize: 10_000 },
        { name: "B", populationSize: 100 },
    ], 10);
    expect(squareRoot.map((layer) => layer.sampleSize)).toEqual([9, 1]);

    const sizeMeasure = calculateSizeMeasureAllocation([
        { name: "A", populationSize: 100, sizeMeasure: 10 },
        { name: "B", populationSize: 100, sizeMeasure: 1 },
    ], 10);
    expect(sizeMeasure.map((layer) => layer.sampleSize)).toEqual([9, 1]);
});

test("stratified weights verify population counts and sampled counts, not only layer names", () => {
    const population = [{ g: "A" }, { g: "A" }, { g: "B" }];
    expect(() => calculateDesignWeights({
        method: "stratified", stratifyBy: "g",
        layers: [{ name: "A", count: 100, sampleCount: 1 }, { name: "B", count: 1, sampleCount: 1 }],
    }, population, [0, 2])).toThrow(/总体|分层设计/);
    expect(() => calculateDesignWeights({
        method: "stratified", stratifyBy: "g",
        layers: [{ name: "A", count: 2, sampleCount: 1 }, { name: "B", count: 1, sampleCount: 1 }],
    }, population, [0, 1])).toThrow(/样本|分层设计/);
});

test("a sample cannot count the same population unit more than once", () => {
    const population = [{ x: 0 }, { x: 10 }];
    expect(() => calculateUnivariate({ population, indices: [0, 0], variable: continuous, weighted: false }))
        .toThrow(/重复/);
    expect(() => calculateDesignWeights({ method: "simple", populationSize: 2, sampleCount: 2 }, population, [0, 0]))
        .toThrow(/重复/);
});

test("category preservation cannot break the twenty-bucket display contract", () => {
    const population = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`C${index}`, 100 / 21]));
    const preserved = Array.from({ length: 20 }, (_, index) => `C${index}`);
    const result = truncateCategoricalDistributions(population, {
        simple: population, systematic: population, pps: population, stratified: population,
    }, preserved)!;
    expect(Object.keys(result.population)).toHaveLength(20);
    expect(Object.values(result.population).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 12);
    for (const distribution of Object.values(result.methods)) {
        expect(Object.keys(distribution)).toHaveLength(20);
        expect(Object.values(distribution).reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 12);
    }
});
