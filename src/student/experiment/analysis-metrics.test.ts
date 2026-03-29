import { expect, test } from "bun:test";
import { buildAnalysisMetrics } from "./analysis-metrics";
import { createSeededRandom, performPPSSampling } from "../sampling";

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
    expect(numericValue.methods.pps.standardError).not.toBeNull();
});
