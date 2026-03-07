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
