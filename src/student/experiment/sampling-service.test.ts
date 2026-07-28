import { expect, test } from "bun:test";
import { executeSamplingAction } from "./sampling-service";

const population = Array.from({ length: 200 }, (_, i) => ({
    id: i + 1,
    gender: i % 2 === 0 ? "男" : "女",
}));

test("systematic sampling returns exact target count for N=200,n=132", async () => {
    const result = await executeSamplingAction({
        method: "systematic",
        rawParams: { seed: 2026 },
        targetSampleSize: 132,
        population,
        fieldMapping: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.sampleCount).toBe(132);
    expect(result.result.data).toHaveLength(132);
    expect(result.result.interval).toBeCloseTo(200 / 132);
    expect(result.result.randomStart!).toBeGreaterThanOrEqual(0);
    expect(result.result.randomStart!).toBeLessThan(result.result.interval!);
});

test("systematic sampling ignores legacy client K and uses the saved target", async () => {
    const result = await executeSamplingAction({
        method: "systematic",
        rawParams: { kValue: 100, sampleSize: 1, seed: 2026 },
        targetSampleSize: 13,
        population,
        fieldMapping: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.sampleCount).toBe(13);
});

test("systematic sampling requires a valid saved target", async () => {
    const result = await executeSamplingAction({
        method: "systematic",
        rawParams: { seed: 2026 },
        targetSampleSize: null,
        population,
        fieldMapping: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorMessage).toBe("请先保存 1-200 之间的最终样本量");
});

test("PPS sampling rejects categorical size fields even when the field exists", async () => {
    const result = await executeSamplingAction({
        method: "pps",
        rawParams: { sizeField: "gender", sampleSize: 10, seed: 2026 },
        targetSampleSize: 10,
        population,
        fieldMapping: { numeric: ["income"] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errorMessage).toBe("规模变量需为包含正数的数值字段");
});

test("PPS sampling rejects fields that have no positive numeric size values", async () => {
    const result = await executeSamplingAction({
        method: "pps",
        rawParams: { sizeField: "weight", sampleSize: 10, seed: 2026 },
        targetSampleSize: 10,
        population: population.map((row) => ({ ...row, weight: 0 })),
        fieldMapping: { numeric: ["weight"] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errorMessage).toBe("规模变量需在总体中对每个单位都为正数");
});
