import { expect, test } from "bun:test";
import { executeSamplingAction } from "./sampling-service";

const population = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    gender: i % 2 === 0 ? "男" : "女",
}));

test("systematic sampling rejects K values whose actual count range can fall outside accepted limits", async () => {
    const result = await executeSamplingAction({
        method: "systematic",
        rawParams: { kValue: 11, seed: 2026 },
        targetSampleSize: 13,
        population,
        fieldMapping: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errorMessage).toBe("K 值导致实际样本量可能为 9-10，需完全落在 10-16 之间");
});

test("systematic sampling still accepts K values whose count range stays within accepted limits", async () => {
    const result = await executeSamplingAction({
        method: "systematic",
        rawParams: { kValue: 10, seed: 2026 },
        targetSampleSize: 13,
        population,
        fieldMapping: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.result.sampleCount).toBe(10);
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

    expect(result.errorMessage).toBe("规模变量需为包含正数的数值字段");
});
