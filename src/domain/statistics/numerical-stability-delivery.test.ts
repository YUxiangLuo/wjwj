import { expect, test } from "bun:test";
import { buildAnalysisMetrics } from "./analysis";
import { sampleVariance } from "./values";
import { performSystematicSampling } from "./sampling";
import { computeSystematicExactMeanSe } from "./systematic";

test("ST-N03 subnormal variances do not collapse representable design SEs", () => {
    for (const scale of [1, 1e-155, 1e-160]) {
        const population = Array.from({ length: 1000 }, (_, i) => ({ y: i % 2 * scale }));
        for (const n of [1, 100, 499, 999, 1000]) {
            const sample = performSystematicSampling(population, n, () => .12345);
            const metrics = buildAnalysisMetrics({ population,
                fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
                samplingResults: { simple: { completed: true, sampleCount: n, data: sample.data }, systematic: { ...sample, completed: true, sampleCount: n } },
            });
            const simple = metrics.target!.methods.simple;
            // Exact balanced binary population: sigma²=1/4. Compare in original units
            // so an incorrect zero cannot pass an absolute tiny-number tolerance.
            expect(simple.standardError! / scale).toBeCloseTo(Math.sqrt(.25 * (1000 - n) / (999 * n)), 12);
            expect(simple.effectiveSampleSize!).toBeCloseTo(n, 8);
            const systematicSe = n === 1000 ? 0 : n % 2 ? .5 / n : .5;
            expect(metrics.target!.methods.systematic.standardError! / scale).toBeCloseTo(systematicSe, 12);
        }
        expect(computeSystematicExactMeanSe(population, "y", { completed: true, kValue: 2, sampleCount: 500 })! / scale).toBeCloseTo(.5, 12);
    }
});

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
