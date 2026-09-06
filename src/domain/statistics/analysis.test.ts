import { expect, test } from "bun:test";
import { buildAnalysisMetrics } from "./analysis";
import { createSeededRandom, performPPSSampling } from "./sampling";
import { buildAnalysisMetrics as configuredAnalysis } from "../../student/experiment/analysis-metrics";

test("domain analysis uses explicit configuration while the compatibility API retains environment defaults", () => {
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
        expect(buildAnalysisMetrics({ ...input, ppsMonteCarloReplicates: 32 }).ppsMonteCarloReplicates).toBe(32);
        expect(buildAnalysisMetrics(input).ppsMonteCarloReplicates).toBe(512);
        expect(configuredAnalysis(input).ppsMonteCarloReplicates).toBe(64);
        expect(configuredAnalysis(input)).toEqual(buildAnalysisMetrics({ ...input, ppsMonteCarloReplicates: 64 }));
    } finally {
        if (previous === undefined) delete process.env.PPS_MONTE_CARLO_REPLICATES;
        else process.env.PPS_MONTE_CARLO_REPLICATES = previous;
    }
});
