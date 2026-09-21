import { expect, test } from "bun:test";
import {
    buildSamplingAnimationScale,
    buildStratifiedVisualAllocation,
    MAX_VISUAL_POPULATION,
} from "./sampling-animation-scale";

test("small populations and samples are represented one dot per actual unit", () => {
    expect(buildSamplingAnimationScale(3, 2)).toEqual({
        population: 3,
        sample: 2,
        gridColumns: 3,
        gridRows: 1,
        compressed: false,
    });
    expect(buildSamplingAnimationScale(1, 1).sample).toBe(1);
    expect(buildSamplingAnimationScale(0, 0).population).toBe(0);
});

test("large populations are capped and preserve the sampling fraction", () => {
    expect(buildSamplingAnimationScale(10_000, 2_000)).toMatchObject({
        population: MAX_VISUAL_POPULATION,
        sample: 200,
        compressed: true,
    });
    expect(buildSamplingAnimationScale(10_000, 10_000).sample).toBe(MAX_VISUAL_POPULATION);
    expect(buildSamplingAnimationScale(10_000, 1).sample).toBe(1);
});

test("stratified visual counts retain totals and never sample beyond a visual layer", () => {
    const exact = buildStratifiedVisualAllocation([
        { count: 2, sampleCount: 1 },
        { count: 3, sampleCount: 2 },
    ], 5, 3);
    expect(exact).toEqual({ population: [2, 3], sample: [1, 2] });

    const compressed = buildStratifiedVisualAllocation([
        { count: 2, sampleCount: 2 },
        { count: 998, sampleCount: 98 },
        { count: 9_000, sampleCount: 900 },
    ], 1000, 100);
    expect(compressed.population.reduce((sum, count) => sum + count, 0)).toBe(1000);
    expect(compressed.sample.reduce((sum, count) => sum + count, 0)).toBe(100);
    compressed.sample.forEach((count, index) => expect(count).toBeLessThanOrEqual(compressed.population[index]!));
});
