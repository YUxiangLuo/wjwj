import { expect, test } from "bun:test";
import { buildAnalysisMetrics as calculateAnalysisMetrics } from "./analysis";
import { buildPpsStandardErrorContext } from "./pps";
import { performPPSSampling } from "./sampling";
import { buildStratifiedNumericStats } from "./population";
import { allocateNeymanSampleCounts } from "../../student/components/stratified-allocation";
import { calculateMeanSampleSizeMetrics, calculateOptimalAllocationWithCost } from "../../student/experiment/sample-plan";
import { computeStratifiedValueSe } from "./stratified";

const ppsFrame = () => Array.from({ length: 1000 }, (_, i) => ({ y: i === 0 ? 1000 : 0, size: i === 0 ? 0.001 : 1 }));

test("stratified SE preserves tiny dispersion without squaring it to zero", () => {
    const population = [{ g: "A", y: 0 }, { g: "A", y: 1e-170 }, { g: "B", y: 1 }, { g: "B", y: 1 }];
    const layers = [{ name: "A", count: 2, ratio: 50, sampleCount: 1 }, { name: "B", count: 2, ratio: 50, sampleCount: 1 }];
    const se = computeStratifiedValueSe(population, "g", layers, 4, row => Number(row.y));
    // Only A is random: weight .5 * SD(0,a)=a/sqrt(2) * sqrt(1-1/2) = a/4.
    expect(se! / 2.5e-171).toBeCloseTo(1, 12);
    const metrics = calculateAnalysisMetrics({ population, fieldMapping: { numeric: ["y"], stratified: ["g"], analysisTarget: { kind: "mean", field: "y" } }, samplingResults: { stratified: { completed: true, stratifyBy: "g", layers, sampleCount: 2, data: [population[0]!, population[2]!] } } });
    expect(metrics.target!.methods.stratified.standardError! / 2.5e-171).toBeCloseTo(1, 12);
    expect(metrics.target!.methods.stratified.marginOfError! / 4.9e-171).toBeCloseTo(1, 12);
    expect(computeStratifiedValueSe(population, "g", layers.map(l => ({ ...l, sampleCount: 2 })), 4, row => Number(row.y))).toBe(0);
    expect(computeStratifiedValueSe(population.map(r => ({ ...r, y: 7 })), "g", layers, 4, row => Number(row.y))).toBe(0);
});

test("exact PPS integrates the rare influential unit instead of missing it in simulation", () => {
    const population = ppsFrame();
    const sample = performPPSSampling(population, "size", 40, () => 0.5);
    const metrics = calculateAnalysisMetrics({ population, fieldMapping: {
        numeric: ["y", "size"], analysisTarget: { kind: "mean", field: "y" },
    }, samplingResults: { pps: { ...sample, completed: true, sizeField: "size", sampleCount: 40 } }, ppsMonteCarloReplicates: 512 });
    expect(metrics.numeric.y?.methods.pps.standardError).toBeCloseTo(6.090077115014714, 9);
    expect(metrics.target?.methods.pps.estimate).toBe(0);
    expect(metrics.target?.methods.pps.effectiveSampleSize).toBeGreaterThan(0);
    expect(metrics.target?.methods.pps.reliability.status).toBe("caution");
    // Independent analytical two-point distribution: positive variance is real.
    const pi = 40 * 0.001 / 999.001;
    const highEstimate = 1000 / (1 + 39 * 0.001);
    const exactSe = highEstimate * Math.sqrt(pi * (1 - pi));
    expect(exactSe).toBeCloseTo(6.090077115014714, 9);
    const rareDraw = performPPSSampling(population, "size", 40, () => pi / 2);
    expect(rareDraw.indices).toContain(0);
    expect(rareDraw.data).toHaveLength(40);
});

test("PPS preserves provable zero variance for a constant target, balanced equal-size design, and census", () => {
    const constant = [{ y: 7, size: 1 }, { y: 7, size: 10 }, { y: 7, size: 100 }];
    const balanced = [{ y: 0, size: 1 }, { y: 0, size: 1 }, { y: 1, size: 1 }, { y: 1, size: 1 }];
    const fields = [{ key: "y", accessor: (row: Record<string, unknown>) => Number(row.y) }];
    expect(buildPpsStandardErrorContext(constant, "size", 1, fields, 512)?.standardErrors.y).toBe(0);
    expect(buildPpsStandardErrorContext(balanced, "size", 2, fields, 512)?.standardErrors.y).toBe(0);
    expect(buildPpsStandardErrorContext(ppsFrame(), "size", 1000, fields, 512)).toMatchObject({
        mode: "census_exact", replicateCount: 0, standardErrors: { y: 0 },
    });
});

test("zero PPS design variance does not erase small-sample or ratio-estimator cautions", () => {
    const population = [{ y: 0, size: 1 }, { y: 0, size: 1 }, { y: 1, size: 1 }, { y: 1, size: 1 }];
    const sample = performPPSSampling(population, "size", 2, () => 0.25);
    const result = calculateAnalysisMetrics({
        population,
        fieldMapping: { numeric: ["y", "size"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { pps: { ...sample, completed: true, sizeField: "size", sampleCount: 2 } },
        ppsMonteCarloReplicates: 512,
    }).target!.methods.pps;

    expect(result.standardError).toBe(0);
    expect(result.reliability.status).toBe("caution");
    expect(result.reliability.reasons).toContain("实际入样量低于 30，不能仅凭等效样本量判断近似条件");
    expect(result.reliability.reasons).toContain("PPS 比估计可能有偏，设计标准误不能保证区间覆盖");
});

test("rare binary outcomes flag normal approximation even with n above thirty and accurate design SE", () => {
    const population = Array.from({ length: 1000 }, (_, i) => ({ event: i < 3 ? "yes" : "no" }));
    let coverage = 1;
    for (let j = 0; j < 40; j++) coverage *= (997 - j) / (1000 - j);
    expect(coverage).toBeCloseTo(0.8846252264288337, 12);
    for (let x = 0; x <= 3; x++) {
        const sample = Array.from({ length: 40 }, (_, i) => ({ event: i < x ? "yes" : "no" }));
        const metrics = calculateAnalysisMetrics({ population, fieldMapping: {
            others: ["event"], analysisTarget: { kind: "proportion", field: "event", value: "yes" },
        }, samplingResults: { simple: { completed: true, sampleCount: 40, data: sample } },
        samplePlan: { confidenceLevel: "95", marginOfError: 10 }, ppsMonteCarloReplicates: 512 });
        const result = metrics.target!.methods.simple;
        expect(result.standardError).toBeCloseTo(Math.sqrt(.003 * .997 / 40 * 960 / 999), 12);
        expect(result.reliability.status).toBe("caution");
        expect(result.reliability.reasons.join(" ")).toContain("事件或非事件数量偏少");
    }
});

test("small actual systematic samples are flagged even if their equivalent SRS information is large", () => {
    const population = Array.from({ length: 100 }, (_, i) => ({ y: i < 50 ? i : 150 - i }));
    const result = calculateAnalysisMetrics({ population, fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { systematic: { completed: true, interval: 50, sampleCount: 2, data: [population[0]!, population[50]!] } }, ppsMonteCarloReplicates: 512 });
    // Make a non-degenerate start distribution while preserving efficient pairing.
    population[50]!.y += 1;
    const changed = calculateAnalysisMetrics({ population, fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { systematic: { completed: true, interval: 50, sampleCount: 2, data: [population[0]!, population[50]!] } }, ppsMonteCarloReplicates: 512 });
    expect(result.target!.methods.systematic.standardError).toBe(0);
    expect(changed.target!.methods.systematic.effectiveSampleSize).toBeGreaterThan(30);
    expect(changed.target!.methods.systematic.reliability.reasons.join(" ")).toContain("实际入样量低于 30");
});

test("integer Neyman allocation beats the former largest-remainder counterexample and is scale invariant", () => {
    for (const factor of [1e-200, 1, 1e200]) {
        expect(allocateNeymanSampleCounts({ targetSampleSize: 15, populationCounts: [8, 4, 12], stdDevs: [1, 2, 5].map(s => s * factor) })).toEqual([2, 2, 11]);
    }
});

test("integer allocation matches exhaustive feasible allocations including zero-variance and singleton strata", () => {
    for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) for (let c = 1; c <= 5; c++) {
        const caps = [a, b, c];
        for (const sd of [[0, 1, 4], [2, 1, 3], [0, 0, 0]]) for (let n = 3; n <= a + b + c; n++) {
            const allocation = allocateNeymanSampleCounts({ targetSampleSize: n, populationCounts: caps, stdDevs: sd })!;
            const objective = (counts: number[]) => counts.reduce((sum, count, i) => sum + (caps[i]! * sd[i]!) ** 2 / count, 0);
            let best = Infinity;
            for (let x = 1; x <= a; x++) for (let y = 1; y <= b; y++) {
                const z = n - x - y;
                if (z >= 1 && z <= c) best = Math.min(best, objective([x, y, z]));
            }
            expect(allocation.reduce((sum, count) => sum + count, 0)).toBe(n);
            expect(objective(allocation)).toBeCloseTo(best, 10);
        }
    }
    expect(allocateNeymanSampleCounts({ targetSampleSize: 2, populationCounts: [1, 3, 5], stdDevs: [0, 1, 4] })).toBeNull();
});

test("known zero population stratum variance differs from missing numeric values", () => {
    const stats = buildStratifiedNumericStats([{ g: "single", y: 10 }, { g: "constant", y: 20 }, { g: "constant", y: 20 }, { g: "missing", y: null }], { numeric: ["y"], stratified: ["g"] });
    expect(stats.g?.single?.y).toEqual({ mean: 10, stdDev: 0 });
    expect(stats.g?.constant?.y).toEqual({ mean: 20, stdDev: 0 });
    expect(stats.g?.missing?.y).toBeUndefined();
});

test("budget integer approximation preserves every nonempty stratum when coverage is affordable", () => {
    const layers = [{ name: "A", populationSize: 10, stdDev: 1, unitCost: 2 }, { name: "B", populationSize: 10, stdDev: 4, unitCost: 1 }];
    expect(calculateOptimalAllocationWithCost(layers, 5)).toMatchObject({ totalSampleSize: 4, totalCost: 5, uncoveredLayers: [] });
    expect(calculateOptimalAllocationWithCost(layers, 5)!.allocation.map(layer => layer.sampleSize)).toEqual([1, 3]);
    for (let cost = 1; cost <= 8; cost++) for (let budget = cost + 2; budget < 40; budget++) {
        const varied = [layers[0]!, { ...layers[1]!, unitCost: cost }];
        const result = calculateOptimalAllocationWithCost(varied, budget)!;
        expect(result.totalCost).toBeLessThanOrEqual(budget);
        expect(result.uncoveredLayers).toEqual([]);
        expect(result.allocation.every((layer) => layer.sampleSize >= 1 && layer.sampleSize <= 10)).toBe(true);
    }
});

test("mean precision preserves zero as a provided center but does not invent a zero mean or RSE", () => {
    const base = { populationSize: 1000, confidenceLevel: "95", marginOfError: 1, populationVariance: 25, designEffect: 4 };
    const absent = calculateMeanSampleSizeMetrics(base)!;
    const zero = calculateMeanSampleSizeMetrics({ ...base, estimatedMean: 0 })!;
    expect(absent.confidenceInterval).toBeNull();
    expect(absent.relativeStandardError).toBeNull();
    expect(zero.relativeStandardError).toBeNull();
    expect(zero.confidenceInterval!.lower).toBeLessThan(0);
    expect(zero.confidenceInterval!.upper).toBeGreaterThan(0);
});
