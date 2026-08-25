import { expect, test } from "bun:test";
import {
    compactSamplingMethodResult,
    compactSamplingResults,
    hydrateSamplingResults,
    samplingResultsNeedPopulation,
} from "./sampling-storage";

const population = [{ id: 1 }, { id: 2 }, { id: 3 }];

test("compact sampling storage drops repeated row payloads but keeps replay indices", () => {
    const compact = compactSamplingMethodResult({
        completed: true,
        sampleCount: 2,
        indices: [2, 0],
        data: [population[2], population[0]],
    });

    expect(compact).toEqual({ completed: true, sampleCount: 2, indices: [2, 0] });
    expect(compact).not.toHaveProperty("data");
});

test("compact and hydrate sampling results round-trip every method", () => {
    const stored = compactSamplingResults({
        simple: { completed: true, indices: [2, 0], data: [population[2], population[0]] },
        pps: { unavailable: true },
    });

    expect(samplingResultsNeedPopulation(stored)).toBe(true);
    expect(hydrateSamplingResults(stored, population)).toEqual({
        simple: { completed: true, indices: [2, 0], data: [population[2], population[0]] },
        pps: { unavailable: true },
    });
});

test("hydration and compaction preserve legacy embedded rows without replay indices", () => {
    const legacy = { simple: { completed: true, data: [{ id: 9 }] } };
    expect(compactSamplingResults(legacy)).toEqual(legacy);
    expect(samplingResultsNeedPopulation(legacy)).toBe(false);
    expect(hydrateSamplingResults(legacy, population)).toEqual(legacy);

});

test("hydration rejects invalid stored indices", () => {
    expect(hydrateSamplingResults({ simple: { indices: [0, 99] } }, population)).toEqual({
        simple: { indices: [0, 99], data: [] },
    });
});
