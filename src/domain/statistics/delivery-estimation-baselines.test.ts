import { expect, test } from "bun:test";
import { buildAnalysisMetrics } from "./analysis";
import { performPPSSampling } from "./sampling";
import { computeFinitePopulationEquivalentSampleSize } from "./srs";

test("ST-B6 stratified estimate and SE use Nh/nh with a separate FPC in each asymmetric stratum", () => {
    const population = [
        ...[0, 2, 4, 6, 8, 10].map(y => ({ stratum: "A", y })),
        ...[10, 20, 30, 40].map(y => ({ stratum: "B", y })),
    ];
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { numeric: ["y"], stratified: ["stratum"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: {
            stratified: {
                completed: true,
                sampleCount: 3,
                stratifyBy: "stratum",
                layers: [
                    { name: "A", count: 6, ratio: 60, sampleCount: 1 },
                    { name: "B", count: 4, ratio: 40, sampleCount: 2 },
                ],
                data: [population[1]!, population[6]!, population[9]!],
            },
        },
    });

    const result = metrics.target!.methods.stratified;
    expect(result.estimate).toBeCloseTo(11.2, 12);
    expect(result.standardError).toBeCloseTo(3.296462750686964, 12);
});

test("ST-B7 ordered systematic sampling uses exact random-start SE rather than SRS SE", () => {
    const population = [0, 100, 0, 0, 100, 0].map(y => ({ y }));
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: {
            simple: { completed: true, sampleCount: 2, data: [population[0]!, population[3]!] },
            systematic: { completed: true, sampleCount: 2, interval: 3, randomStart: 0, data: [population[0]!, population[3]!] },
        },
    });

    const systematic = metrics.target!.methods.systematic;
    expect(systematic.estimate).toBe(0);
    expect(systematic.standardError).toBeCloseTo(47.14045207910317, 12);
    expect(systematic.standardError).not.toBe(metrics.target!.methods.simple.standardError);
});

test("ST-B8 n=1 PPS uses the Hajek estimate and exact design SE", () => {
    const population = [
        { y: 10, size: 1 },
        { y: 20, size: 2 },
        { y: 100, size: 3 },
    ];
    const sample = performPPSSampling(population, "size", 1, () => 0);
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { numeric: ["y", "size"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults: { pps: { ...sample, completed: true, sampleCount: 1, sizeField: "size" } },
    });

    expect(sample.indices).toEqual([0]);
    expect(sample.inclusionProbabilities).toEqual([1 / 6]);
    const result = metrics.target!.methods.pps;
    expect(result.estimate).toBe(10);
    expect(result.estimate).not.toBeCloseTo(10 / (1 / 6) / population.length, 12);
    expect(result.standardError).toBeCloseTo(41.79978734661484, 12);
});

test("equivalent SRS sample size stays positive or becomes unavailable at numeric limits", () => {
    expect(computeFinitePopulationEquivalentSampleSize(Number.MIN_VALUE, 1000, 1)).toBe(Number.MIN_VALUE);
    expect(computeFinitePopulationEquivalentSampleSize(1, 1000, 1e200)).toBeNull();
    expect(computeFinitePopulationEquivalentSampleSize(1, 1000, 0)).toBe(1000);
});

test("a constant non-census proportion has zero SE without being labelled a census", () => {
    const population = Array.from({ length: 40 }, () => ({ outcome: "yes" }));
    const metrics = buildAnalysisMetrics({
        population,
        fieldMapping: { others: ["outcome"], analysisTarget: { kind: "proportion", field: "outcome", value: "yes" } },
        samplingResults: { simple: { completed: true, sampleCount: 20, data: population.slice(0, 20) } },
    });

    const result = metrics.target!.methods.simple;
    expect(result.estimate).toBe(1);
    expect(result.standardError).toBe(0);
    expect(result.effectiveSampleSize).toBe(40);
    expect(result.reliability.status).not.toBe("census");
});

test("confidence choice changes only z times SE, not the estimate", () => {
    const population = [0, 2, 8, 20].map(y => ({ y }));
    const samplingResults = { simple: { completed: true, sampleCount: 2, data: [population[0]!, population[2]!] } };
    const byConfidence = (["90", "95", "99"] as const).map(confidenceLevel => buildAnalysisMetrics({
        population,
        fieldMapping: { numeric: ["y"], analysisTarget: { kind: "mean", field: "y" } },
        samplingResults,
        samplePlan: { confidenceLevel },
    }).target!);
    const zValues = [1.645, 1.96, 2.576];

    expect(byConfidence.map(target => target.methods.simple.estimate)).toEqual([4, 4, 4]);
    for (let index = 0; index < byConfidence.length; index += 1) {
        const method = byConfidence[index]!.methods.simple;
        expect(method.marginOfError).toBeCloseTo(zValues[index]! * method.standardError!, 12);
    }
});
