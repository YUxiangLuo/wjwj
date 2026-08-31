import { expect, test } from "bun:test";
import {
    DEFAULT_PPS_MONTE_CARLO_REPLICATES,
    buildAnalysisMetrics,
    resolvePpsMonteCarloReplicates,
} from "./analysis-metrics";
import {
    createSeededRandom,
    drawPreparedPPSSample,
    performPPSSampling,
    performSystematicSampling,
    preparePPSSampling,
} from "../sampling";

test("PPS Monte Carlo replicate configuration is bounded and defaults safely", () => {
    expect(DEFAULT_PPS_MONTE_CARLO_REPLICATES).toBe(512);
    expect(resolvePpsMonteCarloReplicates(undefined)).toBe(DEFAULT_PPS_MONTE_CARLO_REPLICATES);
    expect(resolvePpsMonteCarloReplicates("512")).toBe(512);
    expect(resolvePpsMonteCarloReplicates("31")).toBe(DEFAULT_PPS_MONTE_CARLO_REPLICATES);
    expect(resolvePpsMonteCarloReplicates("1025")).toBe(DEFAULT_PPS_MONTE_CARLO_REPLICATES);
    expect(resolvePpsMonteCarloReplicates("not-a-number")).toBe(DEFAULT_PPS_MONTE_CARLO_REPLICATES);
});

test("analysis metrics use the true population mean as the numeric comparison baseline", () => {
    const population = [
        { stratum: "A", category: "低", x: 10, size: 1 },
        { stratum: "A", category: "低", x: 20, size: 2 },
        { stratum: "B", category: "高", x: 30, size: 3 },
        { stratum: "B", category: "高", x: 40, size: 4 },
    ];

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: ["stratum"],
            numeric: ["x", "size"],
            others: ["category"],
        },
        samplingResults: {
            simple: { completed: true, sampleCount: 1, data: [{ stratum: "A", category: "低", x: 10, size: 1 }] },
            systematic: { completed: true, kValue: 2, sampleCount: 2, data: [{ stratum: "A", category: "低", x: 10, size: 1 }, { stratum: "B", category: "高", x: 30, size: 3 }] },
            pps: { unavailable: true, unavailableReason: "no valid field" },
            stratified: {
                completed: true,
                stratifyBy: "stratum",
                layers: [
                    { name: "A", count: 2, ratio: 0.5, sampleCount: 1 },
                    { name: "B", count: 2, ratio: 0.5, sampleCount: 1 },
                ],
                data: [{ stratum: "A", category: "低", x: 10, size: 1 }, { stratum: "B", category: "高", x: 40, size: 4 }],
            },
        },
    });

    const numericX = metrics.numeric.x;
    expect(numericX).toBeDefined();
    if (!numericX) throw new Error("expected numeric field x to exist");

    expect(numericX.populationMean).toBe(25);
    expect(numericX.methods.simple.estimate).toBe(10);
    expect(numericX.methods.systematic.estimate).toBe(20);
    expect(numericX.methods.systematic.standardError).toBe(5);
    expect(numericX.methods.stratified.estimate).toBe(25);
});

test("analysis metrics fail closed for historical numeric columns with missing values", () => {
    const metrics = buildAnalysisMetrics({
        population: [{ x: 10 }, { x: "" }, { x: 30 }],
        fieldMapping: { numeric: ["x"], stratified: [], others: [] },
        samplingResults: {
            simple: { completed: true, sampleCount: 2, data: [{ x: 10 }, { x: 30 }] },
        },
    });

    expect(metrics.numericFields).toEqual([]);
    expect(metrics.excludedNumericFields).toEqual(["x"]);
    expect(metrics.numeric.x).toBeUndefined();
});

test("analysis metrics retain an exact standard error for fractional systematic intervals", () => {
    const population = Array.from({ length: 5 }, (_, index) => ({ x: index * 10 }));
    const systematicSample = performSystematicSampling(population, 3, () => 0);

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: [],
            numeric: ["x"],
            others: [],
        },
        samplingResults: {
            systematic: {
                completed: true,
                interval: systematicSample.interval,
                randomStart: systematicSample.randomStart,
                sampleCount: systematicSample.data.length,
                data: systematicSample.data,
            },
        },
    });

    expect(metrics.numeric.x?.methods.systematic.estimate).toBeCloseTo(40 / 3);
    expect(metrics.numeric.x?.methods.systematic.standardError).toBeCloseTo(
        Math.sqrt(200 / 9),
    );
});

test("analysis metrics use stratified weights instead of pooled sample shares for categorical distributions", () => {
    const population = [
        ...Array.from({ length: 8 }, (_, index) => ({ id: index + 1, stratum: "A", choice: "否", size: index + 1 })),
        ...Array.from({ length: 2 }, (_, index) => ({ id: index + 9, stratum: "B", choice: "是", size: index + 9 })),
    ];

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: ["stratum"],
            numeric: ["size"],
            others: ["choice"],
        },
        samplingResults: {
            stratified: {
                completed: true,
                stratifyBy: "stratum",
                layers: [
                    { name: "A", count: 8, ratio: 0.8, sampleCount: 1 },
                    { name: "B", count: 2, ratio: 0.2, sampleCount: 1 },
                ],
                data: [
                    { id: 1, stratum: "A", choice: "否", size: 1 },
                    { id: 9, stratum: "B", choice: "是", size: 9 },
                ],
            },
        },
    });

    const categoricalChoice = metrics.categorical.choice;
    expect(categoricalChoice).toBeDefined();
    if (!categoricalChoice) throw new Error("expected categorical field choice to exist");

    expect(categoricalChoice.population["是"]).toBe(20);
    expect(categoricalChoice.methods.stratified["是"]).toBe(20);
    expect(categoricalChoice.methods.stratified["否"]).toBe(80);
    expect(categoricalChoice.representativeness.stratified).toBe(0);
});

test("analysis metrics match padded stratum names after trimming", () => {
    const population = [
        { stratum: " A ", x: 10 },
        { stratum: "A", x: 20 },
        { stratum: "B", x: 30 },
        { stratum: " B", x: 40 },
    ];

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: ["stratum"],
            numeric: ["x"],
            others: [],
        },
        samplingResults: {
            stratified: {
                completed: true,
                stratifyBy: "stratum",
                layers: [
                    { name: "A", count: 2, ratio: 0.5, sampleCount: 1 },
                    { name: " B ", count: 2, ratio: 0.5, sampleCount: 1 },
                ],
                data: [{ stratum: " A ", x: 10 }, { stratum: "B", x: 40 }],
            },
        },
    });

    expect(metrics.numeric.x?.methods.stratified.estimate).toBe(25);
});

test("analysis metrics use PPS inclusion probabilities for weighted mean estimation", () => {
    const population = [
        { id: 1, value: 10, size: 1 },
        { id: 2, value: 20, size: 2 },
        { id: 3, value: 200, size: 20 },
        { id: 4, value: 400, size: 40 },
        { id: 5, value: 800, size: 80 },
    ];

    const ppsSample = performPPSSampling(population, "size", 2, createSeededRandom("analysis-pps"));

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: [],
            numeric: ["value", "size"],
            others: [],
        },
        samplingResults: {
            pps: {
                completed: true,
                sizeField: "size",
                sampleCount: ppsSample.data.length,
                randomStart: ppsSample.randomStart,
                inclusionProbabilities: ppsSample.inclusionProbabilities,
                data: ppsSample.data,
            },
        },
    });

    const numericValue = metrics.numeric.value;
    expect(numericValue).toBeDefined();
    if (!numericValue) throw new Error("expected numeric field value to exist");

    const weightedEstimate = numericValue.methods.pps.estimate;
    const rawMean = ppsSample.data.reduce((sum, row) => sum + row.value, 0) / ppsSample.data.length;

    expect(weightedEstimate).not.toBeNull();
    expect(weightedEstimate).not.toBe(rawMean);

    const prepared = preparePPSSampling(population, "size", 2);
    if (!prepared) throw new Error("expected a valid PPS design");
    expect(metrics.ppsStandardErrorMode).toBe("monte_carlo");
    expect(metrics.ppsMonteCarloReplicates).toBeGreaterThanOrEqual(32);
    expect(metrics.ppsMonteCarloReplicates).toBeLessThanOrEqual(1024);
    const replicateEstimates = Array.from({ length: metrics.ppsMonteCarloReplicates }, (_, iteration) => {
        const replicate = drawPreparedPPSSample(prepared, createSeededRandom(`analysis-pps-${iteration}`));
        let weightedSum = 0;
        let totalWeight = 0;
        for (let index = 0; index < replicate.data.length; index += 1) {
            const weight = 1 / replicate.inclusionProbabilities[index]!;
            weightedSum += replicate.data[index]!.value * weight;
            totalWeight += weight;
        }
        return weightedSum / totalWeight;
    });
    const replicateMean = replicateEstimates.reduce((sum, value) => sum + value, 0) / replicateEstimates.length;
    const expectedSe = Math.sqrt(replicateEstimates.reduce(
        (sum, value) => sum + (value - replicateMean) ** 2,
        0,
    ) / (replicateEstimates.length - 1));
    expect(numericValue.methods.pps.standardError).toBeCloseTo(expectedSe, 10);
});

test("PPS census short-circuits the degenerate Monte Carlo design", () => {
    const population = [
        { id: 1, value: 10, size: 1 },
        { id: 2, value: 20, size: 2 },
        { id: 3, value: 30, size: 3 },
    ];

    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: {
            stratified: [],
            numeric: ["value"],
            others: [],
        },
        samplingResults: {
            pps: {
                completed: true,
                sizeField: "size",
                sampleCount: population.length,
                inclusionProbabilities: [1, 1, 1],
                data: population,
            },
        },
    });

    expect(metrics.numeric.value?.methods.pps.estimate).toBe(20);
    expect(metrics.numeric.value?.methods.pps.standardError).toBe(0);
    expect(metrics.ppsStandardErrorMode).toBe("census_exact");
    expect(metrics.ppsMonteCarloReplicates).toBe(0);
});
