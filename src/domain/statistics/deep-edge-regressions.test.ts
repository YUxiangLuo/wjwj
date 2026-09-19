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
        { p: 0 }, { p: 1 }, { p: -0.1 }, { p: 1.1 }, { deff: 10.01 },
    ]) {
        expect(calculateClusterSamplingSize({ ...base, ...patch })).toBeNull();
    }
    expect(calculateClusterSamplingSize({ ...base, clusterSize: 1, deff: 2 })).toBeNull();
    expect(calculateClusterSamplingSize({ ...base, clusterSize: 1, deff: 1 })).not.toBeNull();
});

test("cluster planning applies finite-population correction to sampled clusters", () => {
    const result = calculateClusterSamplingSize({
        populationSize: 150,
        confidenceLevel: "95",
        marginOfError: 5,
        clusterSize: 30,
        deff: 1.5,
    })!;
    expect(result.requiredClusters).toBe(5);
    expect(result.requiredSampleSize).toBe(150);
    expect(result.marginOfError).toBe(0);

    const fourClusterMargin = 1.96 * Math.sqrt(1.5 * 0.25 / 120 * (5 - 4) / (5 - 1));
    expect(fourClusterMargin).toBeGreaterThan(0.05);
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
