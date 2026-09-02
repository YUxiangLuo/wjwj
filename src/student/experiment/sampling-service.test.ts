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

test("PPS sampling rejects a size field that equals the analysis target", async () => {
    const result = await executeSamplingAction({
        method: "pps",
        rawParams: { sizeField: "weight", sampleSize: 10, seed: 2026 },
        targetSampleSize: 10,
        population: population.map((row) => ({ ...row, weight: row.id, income: row.id + 1 })),
        fieldMapping: {
            numeric: ["weight", "income"],
            analysisTarget: { kind: "mean", field: "weight" },
        },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorMessage).toBe("PPS 规模变量不能与研究目标变量相同，请改用抽样前已知的辅助变量");
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

test("PPS sampling rejects positive fields when the numeric mapping is empty", async () => {
    const result = await executeSamplingAction({
        method: "pps",
        rawParams: { sizeField: "weight", sampleSize: 10, seed: 2026 },
        targetSampleSize: 10,
        population: population.map((row) => ({ ...row, weight: row.id })),
        fieldMapping: { numeric: [] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorMessage).toBe("规模变量需为包含正数的数值字段");
});

test("simple sampling rejects malformed or non-numeric sample sizes", async () => {
    for (const sampleSize of ["10", "10junk", "10.5", "1e2", [10], { value: 10 }, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
        const result = await executeSamplingAction({
            method: "simple",
            rawParams: { sampleSize, seed: 2026 },
            targetSampleSize: 10,
            population,
            fieldMapping: null,
        });
        expect(result.ok).toBe(false);
    }

    const valid = await executeSamplingAction({
        method: "simple",
        rawParams: { sampleSize: 10, seed: 2026 },
        targetSampleSize: 10,
        population,
        fieldMapping: null,
    });
    expect(valid.ok).toBe(true);
});

test("PPS sampling rejects malformed or non-numeric sample sizes", async () => {
    const weightedPopulation = population.map((row) => ({ ...row, weight: row.id }));
    for (const sampleSize of ["10", "10junk", "10.5", "1e2", [10], { value: 10 }, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
        const result = await executeSamplingAction({
            method: "pps",
            rawParams: { sizeField: "weight", sampleSize, seed: 2026 },
            targetSampleSize: 10,
            population: weightedPopulation,
            fieldMapping: { numeric: ["weight"] },
        });
        expect(result.ok).toBe(false);
    }

    const valid = await executeSamplingAction({
        method: "pps",
        rawParams: { sizeField: "weight", sampleSize: 10, seed: 2026 },
        targetSampleSize: 10,
        population: weightedPopulation,
        fieldMapping: { numeric: ["weight"] },
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.result.probabilitySummary?.populationCount).toBe(weightedPopulation.length);
    expect(valid.result.probabilitySummary?.probabilitySum).toBeCloseTo(10, 8);
    expect(valid.result.probabilitySummary?.minInclusionProbability).toBeGreaterThan(0);
    expect(valid.result.probabilitySummary?.maxInclusionProbability).toBeLessThanOrEqual(1);
});

test("PPS sampling caps its accepted range at a small population", async () => {
    const smallPopulation = population.slice(0, 12).map((row) => ({ ...row, weight: row.id }));
    const invalid = await executeSamplingAction({
        method: "pps",
        rawParams: { sizeField: "weight", sampleSize: 13, seed: 2026 },
        targetSampleSize: 12,
        population: smallPopulation,
        fieldMapping: { numeric: ["weight"] },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.errorMessage).toContain("1-12");

    const valid = await executeSamplingAction({
        method: "pps",
        rawParams: { sizeField: "weight", sampleSize: 12, seed: 2026 },
        targetSampleSize: 12,
        population: smallPopulation,
        fieldMapping: { numeric: ["weight"] },
    });
    expect(valid.ok).toBe(true);
});

test("sampling generates and returns a reproducible seed when the client omits one", async () => {
    const result = await executeSamplingAction({
        method: "simple",
        rawParams: { sampleSize: 10 },
        targetSampleSize: 10,
        population,
        fieldMapping: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Number.isSafeInteger(result.result.seed)).toBe(true);

    const replay = await executeSamplingAction({
        method: "simple",
        rawParams: { sampleSize: 10, seed: result.result.seed },
        targetSampleSize: 10,
        population,
        fieldMapping: null,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.result.data).toEqual(result.result.data);
});

test("stratified sampling rejects duplicate normalized layer names", async () => {
    const result = await executeSamplingAction({
        method: "stratified",
        rawParams: {
            stratifyBy: "gender",
            layers: [
                { name: "男", sampleCount: 5 },
                { name: " 男 ", sampleCount: 5 },
            ],
            seed: 2026,
        },
        targetSampleSize: 10,
        population,
        fieldMapping: { stratified: ["gender"] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorMessage).toBe("分层“男”不能重复配置");
});

test("stratified sampling requires every nonempty population layer", async () => {
    const result = await executeSamplingAction({
        method: "stratified",
        rawParams: {
            stratifyBy: "gender",
            layers: [{ name: "男", sampleCount: 10 }],
            seed: 2026,
        },
        targetSampleSize: 10,
        population,
        fieldMapping: { stratified: ["gender"] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorMessage).toBe("请为全部总体分层配置样本数，缺少：女");
});

test("stratified sampling accepts each population layer exactly once", async () => {
    const result = await executeSamplingAction({
        method: "stratified",
        rawParams: {
            stratifyBy: "gender",
            layers: [
                { name: "男", sampleCount: 5 },
                { name: "女", sampleCount: 5 },
            ],
            seed: 2026,
        },
        targetSampleSize: 10,
        population,
        fieldMapping: { stratified: ["gender"] },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.data).toHaveLength(10);
    expect(result.result.layers).toHaveLength(2);
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
