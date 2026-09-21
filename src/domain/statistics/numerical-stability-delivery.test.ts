import { expect, test } from "bun:test";
import { buildAnalysisMetrics } from "./analysis";
import { sampleVariance } from "./values";

test("ST-N01 shared large translations preserve sample variance and design standard error", () => {
    const original = [0, 0.003, 0.009, 0.019];
    const offset = 1e12;
    const translated = original.map(value => offset + value);
    // The independently derived reference uses the actual representable deltas after translation.
    const representedDeltas = translated.map(value => value - offset);

    expect(sampleVariance(translated)).toBeCloseTo(sampleVariance(representedDeltas), 12);

    const originalPopulation = [0, 3, 9, 19, 27, 41].map(y => ({ y }));
    const translatedPopulation = originalPopulation.map(row => ({ y: offset + row.y }));
    const originalSample = originalPopulation.slice(0, 4);
    const translatedSample = translatedPopulation.slice(0, 4);
    const originalMetrics = buildAnalysisMetrics({
        population: originalPopulation,
        fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { simple: { completed: true, sampleCount: 4, data: originalSample } },
    });
    const translatedMetrics = buildAnalysisMetrics({
        population: translatedPopulation,
        fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { simple: { completed: true, sampleCount: 4, data: translatedSample } },
    });

    expect(translatedMetrics.target!.methods.simple.standardError).toBeCloseTo(originalMetrics.target!.methods.simple.standardError!, 12);
    expect(JSON.stringify(translatedMetrics)).not.toMatch(/NaN|Infinity/);
});

test("ST-N02 unrepresentable finite-input dispersion is excluded before serialization", () => {
    const population = [{ y: Number.MAX_VALUE }, { y: -Number.MAX_VALUE }];
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { simple: { completed: true, sampleCount: 1, data: [population[0]!] } },
    });

    expect(metrics.numericFields).toEqual([]);
    expect(metrics.excludedNumericFields).toEqual(["y"]);
    expect(metrics.target).toBeNull();
    expect(JSON.stringify(metrics)).not.toMatch(/NaN|Infinity/);
});
