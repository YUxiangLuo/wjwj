import { expect, test } from "bun:test";
import { buildAnalysisMetrics } from "./analysis";
import { createSeededRandom, performPPSSampling } from "./sampling";

for (const [label, values, scale] of [
    ["full-width", ["１", "２", "３", "４"], 1],
    ["thousands", ["1,000", "2,000", "3,000", "4,000"], 1000],
    ["scientific", ["1e0", "2e0", "3e0", "4e0"], 1],
] as const) {
    test(`${label} numeric targets retain complete estimates and design errors`, () => {
        const population = values.map((value, i) => ({ "y ": value, size: i + 1 }));
        const metrics = buildAnalysisMetrics({
            population, fieldMapping: { numeric: ["y ", "size"], analysisTarget: { kind: "mean", field: "y " } },
            samplingResults: { simple: { completed: true, sampleCount: 2, data: [population[0]!, population[2]!] } },
        });
        expect(metrics.target?.methods.simple.estimate).toBe(2 * scale);
        expect(metrics.target?.methods.simple.standardError).toBeCloseTo(Math.sqrt(5 / 12) * scale, 10);
        expect(metrics.numeric["y "]?.methods.simple.estimate).toBe(2 * scale);
        expect(metrics.excludedNumericFields).toEqual([]);
    });
}

test("exact PPS analysis ignores legacy simulation configuration", () => {
    const previous = process.env.PPS_MONTE_CARLO_REPLICATES;
    process.env.PPS_MONTE_CARLO_REPLICATES = "64";
    try {
        const population = Array.from({ length: 20 }, (_, i) => ({ size: i + 1, score: i % 7 }));
        const sample = performPPSSampling(population, "size", 5, createSeededRandom(123));
        const input = {
            population,
            fieldMapping: { numeric: ["size", "score"] },
            samplingResults: { pps: { ...sample, completed: true, sizeField: "size", sampleCount: 5 } },
        };
        expect(buildAnalysisMetrics({ ...input, ppsMonteCarloReplicates: 32 }).ppsMonteCarloReplicates).toBe(0);
        expect(buildAnalysisMetrics(input).ppsMonteCarloReplicates).toBe(0);
        expect(buildAnalysisMetrics(input)).toEqual(buildAnalysisMetrics({ ...input, ppsMonteCarloReplicates: 64 }));
    } finally {
        if (previous === undefined) delete process.env.PPS_MONTE_CARLO_REPLICATES;
        else process.env.PPS_MONTE_CARLO_REPLICATES = previous;
    }
});
