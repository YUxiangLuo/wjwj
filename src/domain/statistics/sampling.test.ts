import { expect, test } from "bun:test";
import { estimateWeightedMean } from "./pps";
import { createSeededRandom, drawPreparedPPSSample, performPPSSampling, performSimpleSampling, performStratifiedSampling, performSystematicSampling, preparePPSSampling } from "./sampling";

const population = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, group: i % 3 === 0 ? "A" : "B" }));

test("simple sampling is deterministic with same seed", async () => {
    const seed = "course-2026";
    const first = await performSimpleSampling(population, 8, createSeededRandom(seed));
    const second = await performSimpleSampling(population, 8, createSeededRandom(seed));

    expect(first).toEqual(second);
});

test("simple sampling changes with different seeds", async () => {
    const first = await performSimpleSampling(population, 8, createSeededRandom("seed-a"));
    const second = await performSimpleSampling(population, 8, createSeededRandom("seed-b"));

    expect(first).not.toEqual(second);
});

test("simple sampling returns exact requested count", async () => {
    const result = await performSimpleSampling(population, 10, createSeededRandom("count-test"));
    expect(result.length).toBe(10);
});

test("simple sampling with n larger than population returns all items", async () => {
    const small = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = await performSimpleSampling(small, 100, createSeededRandom("overflow"));
    expect(result.length).toBe(3);
});

test("simple sampling with n=0 returns empty array", async () => {
    const result = await performSimpleSampling(population, 0, createSeededRandom("zero"));
    expect(result.length).toBe(0);
});

test("simple sampling on empty population returns empty array", async () => {
    const result = await performSimpleSampling([], 5, createSeededRandom("empty"));
    expect(result).toEqual([]);
});

test("systematic sampling is deterministic with same seed", async () => {
    const seed = 42;
    const first = performSystematicSampling(population, 5, createSeededRandom(seed));
    const second = performSystematicSampling(population, 5, createSeededRandom(seed));

    expect(first).toEqual(second);
});

test("systematic sampling returns the exact requested count", () => {
    const result = performSystematicSampling(population, 17, createSeededRandom("exact"));
    expect(result.data.length).toBe(17);
    expect(result.indices.length).toBe(17);
    expect(new Set(result.indices).size).toBe(17);
    expect(result.indices.every((index) => index >= 0 && index < population.length)).toBe(true);
});

test("systematic sampling with n=1 returns one item", () => {
    const result = performSystematicSampling(population, 1, createSeededRandom("one"));
    expect(result.data.length).toBe(1);
    expect(result.interval).toBe(population.length);
});

test("systematic sampling with n=N returns every item", () => {
    const result = performSystematicSampling(population, population.length, createSeededRandom("all"));
    expect(result.data).toEqual(population);
    expect(result.interval).toBe(1);
});

test("systematic sampling on empty population returns an empty selection", () => {
    const result = performSystematicSampling([], 3, createSeededRandom("empty-sys"));
    expect(result).toEqual({ data: [], indices: [], interval: 0, randomStart: 0 });
});

// Stratified sampling tests

const stratifiedPop = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: i + 1, region: "North" })),
    ...Array.from({ length: 10 }, (_, i) => ({ id: i + 21, region: "South" })),
    ...Array.from({ length: 5 }, (_, i) => ({ id: i + 31, region: "East" })),
];

const layers = [
    { name: "North", sampleCount: 4 },
    { name: "South", sampleCount: 2 },
    { name: "East", sampleCount: 1 },
];

test("stratified sampling is deterministic with same seed", async () => {
    const seed = "strat-2026";
    const first = await performStratifiedSampling(stratifiedPop, "region", layers, createSeededRandom(seed));
    const second = await performStratifiedSampling(stratifiedPop, "region", layers, createSeededRandom(seed));

    expect(first).toEqual(second);
});

test("stratified sampling changes with different seeds", async () => {
    const first = await performStratifiedSampling(stratifiedPop, "region", layers, createSeededRandom("strat-a"));
    const second = await performStratifiedSampling(stratifiedPop, "region", layers, createSeededRandom("strat-b"));

    expect(first).not.toEqual(second);
});

test("stratified sampling returns correct total count", async () => {
    const result = await performStratifiedSampling(stratifiedPop, "region", layers, createSeededRandom("total"));
    const expectedCount = layers.reduce((sum, l) => sum + l.sampleCount, 0);
    expect(result.length).toBe(expectedCount);
});

test("stratified sampling samples from correct strata", async () => {
    const result = await performStratifiedSampling(stratifiedPop, "region", layers, createSeededRandom("strata-check"));
    const northSamples = result.filter((r) => r.region === "North");
    const southSamples = result.filter((r) => r.region === "South");
    const eastSamples = result.filter((r) => r.region === "East");

    expect(northSamples.length).toBe(4);
    expect(southSamples.length).toBe(2);
    expect(eastSamples.length).toBe(1);
});

test("stratified sampling matches layer names after trimming", async () => {
    const padded = [
        { id: 1, region: " North " },
        { id: 2, region: "North" },
        { id: 3, region: "South" },
        { id: 4, region: " South" },
    ];
    const result = await performStratifiedSampling(
        padded,
        "region",
        [{ name: "North", sampleCount: 2 }, { name: " South ", sampleCount: 2 }],
        createSeededRandom("trim"),
    );
    expect(result.length).toBe(4);
    expect(result.filter((row) => String(row.region).trim() === "North").length).toBe(2);
    expect(result.filter((row) => String(row.region).trim() === "South").length).toBe(2);
});

test("stratified sampling skips missing groups", async () => {
    const layersWithMissing = [
        { name: "North", sampleCount: 3 },
        { name: "West", sampleCount: 5 }, // "West" does not exist in population
    ];
    const result = await performStratifiedSampling(stratifiedPop, "region", layersWithMissing, createSeededRandom("missing"));
    expect(result.length).toBe(3);
    expect(result.every((r) => r.region === "North")).toBe(true);
});

test("stratified sampling with sampleCount=0 for a layer skips that layer", async () => {
    const layersWithZero = [
        { name: "North", sampleCount: 0 },
        { name: "South", sampleCount: 2 },
    ];
    const result = await performStratifiedSampling(stratifiedPop, "region", layersWithZero, createSeededRandom("zero-layer"));
    expect(result.length).toBe(2);
    expect(result.every((r) => r.region === "South")).toBe(true);
});

test("stratified sampling with empty population returns empty array", async () => {
    const result = await performStratifiedSampling([], "region", layers, createSeededRandom("empty-strat"));
    expect(result).toEqual([]);
});

test("stratified sampling with empty layers returns empty array", async () => {
    const result = await performStratifiedSampling(stratifiedPop, "region", [], createSeededRandom("empty-layers"));
    expect(result).toEqual([]);
});

test("stratified sampling supports Object prototype names as strata", () => {
    const special = [
        { id: 1, region: "__proto__" },
        { id: 2, region: "__proto__" },
        { id: 3, region: "constructor" },
    ];
    const result = performStratifiedSampling(
        special,
        "region",
        [{ name: "__proto__", sampleCount: 2 }, { name: "constructor", sampleCount: 1 }],
        createSeededRandom("prototype-strata"),
    );
    expect(result).toHaveLength(3);
    expect(result.filter((row) => row.region === "__proto__")).toHaveLength(2);
    expect(result.filter((row) => row.region === "constructor")).toHaveLength(1);
});

// PPS sampling tests

const ppsPop = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    size: (i + 1) * 10, // sizes: 10, 20, 30, ..., 500
}));

test("PPS sampling is deterministic with same seed", async () => {
    const seed = "pps-2026";
    const first = await performPPSSampling(ppsPop, "size", 10, createSeededRandom(seed));
    const second = await performPPSSampling(ppsPop, "size", 10, createSeededRandom(seed));
    expect(first).toEqual(second);
});

test("PPS sampling changes with different seeds", async () => {
    const first = await performPPSSampling(ppsPop, "size", 10, createSeededRandom("pps-a"));
    const second = await performPPSSampling(ppsPop, "size", 10, createSeededRandom("pps-b"));
    expect(first).not.toEqual(second);
});

test("PPS sampling returns exactly the requested sample count", async () => {
    const result = await performPPSSampling(ppsPop, "size", 8, createSeededRandom("pps-check"));
    expect(result.data.length).toBe(8);
    expect(result.inclusionProbabilities.length).toBe(8);
    expect(result.probabilitySummary?.populationCount).toBe(50);
    expect(result.probabilitySummary?.probabilitySum).toBeCloseTo(8, 8);
    expect(result.probabilitySummary?.minInclusionProbability).toBeGreaterThan(0);
    expect(result.probabilitySummary?.maxInclusionProbability).toBeLessThanOrEqual(1);
    for (const item of result.data) {
        expect(ppsPop).toContainEqual(item);
    }
});

test("PPS sampling on empty population returns empty array", async () => {
    const result = await performPPSSampling([], "size", 5, createSeededRandom("pps-empty"));
    expect(result).toEqual({
        data: [],
        indices: [],
        inclusionProbabilities: [],
        randomStart: 0,
    });
});

test("PPS sampling with n=0 returns empty array", async () => {
    const result = await performPPSSampling(ppsPop, "size", 0, createSeededRandom("pps-zero"));
    expect(result).toEqual({
        data: [],
        indices: [],
        inclusionProbabilities: [],
        randomStart: 0,
    });
});

test("PPS sampling returns empty array when all sizes are zero", async () => {
    const zeroSizePop = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, size: 0 }));
    const result = await performPPSSampling(zeroSizePop, "size", 5, createSeededRandom("pps-zero-size"));
    expect(result.data).toEqual([]);
});

test("PPS sampling returns empty array when size field is missing", async () => {
    const noSizePop = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }));
    const result = await performPPSSampling(noSizePop, "missing_field", 5, createSeededRandom("pps-no-field"));
    expect(result.data).toEqual([]);
});

test("PPS sampling returns exact count without duplicate units even with highly skewed sizes", async () => {
    const skewedPop = [
        { id: 1, size: 10000 },
        ...Array.from({ length: 49 }, (_, i) => ({ id: i + 2, size: 1 })),
    ];
    const result = await performPPSSampling(skewedPop, "size", 10, createSeededRandom("pps-skewed"));
    expect(result.data.length).toBe(10);
    expect(new Set(result.data.map((row) => row.id)).size).toBe(10);
    expect(result.data.some((row) => row.id === 1)).toBe(true);
});

test("PPS sampling treats units with pi >= 1 as certainty selections", async () => {
    const certaintyPop = [
        { id: 1, size: 100 },
        { id: 2, size: 1 },
        { id: 3, size: 1 },
        { id: 4, size: 1 },
    ];
    const result = await performPPSSampling(certaintyPop, "size", 2, createSeededRandom("pps-certainty"));

    expect(result.data.length).toBe(2);
    expect(result.data.some((row) => row.id === 1)).toBe(true);
    const certaintyIndex = result.data.findIndex((row) => row.id === 1);
    expect(result.inclusionProbabilities[certaintyIndex]).toBe(1);
    expect(result.probabilitySummary?.certaintyUnitCount).toBe(1);
});

test("prepared PPS sampling reproduces direct PPS sampling with the same seed", async () => {
    const seed = "pps-prepared";
    const prepared = preparePPSSampling(ppsPop, "size", 10);

    expect(prepared).not.toBeNull();
    if (!prepared) return;

    const direct = await performPPSSampling(ppsPop, "size", 10, createSeededRandom(seed));
    const fromPrepared = drawPreparedPPSSample(prepared, createSeededRandom(seed));

    expect(fromPrepared).toEqual(direct);
});

// ---------------------------------------------------------------------------
// docs/VARIABLE_ANALYSIS_TEST_PLAN.md §3：小型非等规模总体的已手算合法设计。
// 期望区间/概率/估计值由定义独立推导，未用被测抽样函数生成。
// ---------------------------------------------------------------------------

// N=4，size=[1,2,3,4]，n=2 → π=[0.2,0.4,0.6,0.8]，累积区间
// [0,0.2) [0.2,0.6) [0.6,1.2) [1.2,2)；两个系统点 u、u+1。
const handPpsData = [10, 20, 30, 40].map((y, index) => ({ id: index + 1, y, size: index + 1 }));
const drawWithStart = (u: number) => {
    const sampled = performPPSSampling(handPpsData, "size", 2, () => u);
    return {
        indices: sampled.indices,
        probabilities: sampled.inclusionProbabilities,
        estimate: estimateWeightedMean(sampled.data, "y", sampled.inclusionProbabilities),
    };
};
const expectSelection = (u: number, indices: number[], probabilities: number[]) => {
    const { indices: actualIndices, probabilities: actualProbabilities } = drawWithStart(u);
    expect(actualIndices).toEqual(indices);
    // π 由 (n/Σs)·sᵢ 浮点乘出，按计划 §3 的容差比较，不锁定末位
    expect(actualProbabilities).toHaveLength(probabilities.length);
    probabilities.forEach((probability, position) => expect(actualProbabilities[position]).toBeCloseTo(probability, 12));
};

test("PPS fixed-π systematic matches hand-computed intervals and Hájek estimates", () => {
    // u=0.19 落在单元 0，u+1=1.19 落在单元 2；Hájek (10·5+30·5/3)/(5+5/3)=15
    expectSelection(0, [0, 2], [0.2, 0.6]);
    expectSelection(0.19, [0, 2], [0.2, 0.6]);
    expect(drawWithStart(0.19).estimate).toBeCloseTo(15, 12);
    // u=0.2 正好落在第 1/2 单元边界。累计 π 以浮点相加，边界本身是测度零事件；
    // 两侧 1e-9 偏移必须给出确定选择：左侧 [0,2]，右侧 [1,3]。
    expectSelection(0.2 - 1e-9, [0, 2], [0.2, 0.6]);
    expectSelection(0.2 + 1e-9, [1, 3], [0.4, 0.8]);
    expectSelection(0.59, [1, 3], [0.4, 0.8]);
    expect(drawWithStart(0.59).estimate).toBeCloseTo(80 / 3, 12);
    // u=0.61：系统点同时落入后两个单元；(30·5/3+40·1.25)/(5/3+1.25) = 240/7
    expectSelection(0.61, [2, 3], [0.6, 0.8]);
    expect(drawWithStart(0.61).estimate).toBeCloseTo(240 / 7, 12);
    expectSelection(0.99, [2, 3], [0.6, 0.8]);
});

test("PPS certainty units keep π=1 and leave the random frame at n-1", () => {
    const data = [
        { id: 1, y: 1, size: 100 },
        { id: 2, y: 2, size: 1 },
        { id: 3, y: 3, size: 1 },
        { id: 4, y: 4, size: 1 },
    ];
    // π₁ = 2·100/103 > 1 → 必入；剩余 3 个等规模单位再抽 1 个，π = 1/3
    const sampled = performPPSSampling(data, "size", 2, () => 0);
    const certaintyPosition = sampled.indices.indexOf(0);
    expect(sampled.indices).toHaveLength(2);
    expect(certaintyPosition).toBeGreaterThanOrEqual(0);
    expect(sampled.inclusionProbabilities[certaintyPosition]).toBe(1);
    const randomPosition = certaintyPosition === 0 ? 1 : 0;
    expect(sampled.inclusionProbabilities[randomPosition]).toBeCloseTo(1 / 3, 12);
    expect(sampled.probabilitySummary).toMatchObject({ populationCount: 4, certaintyUnitCount: 1 });
    expect(sampled.probabilitySummary!.probabilitySum).toBeCloseTo(2, 12);
    expect(sampled.probabilitySummary!.maxInclusionProbability).toBe(1);
});

test("PPS design rejects an unresolved probability frame instead of faking a zero standard error", () => {
    // n=N 时为普查：全部单位必入
    const census = performPPSSampling(handPpsData, "size", 4, () => 0);
    expect(census.indices).toEqual([0, 1, 2, 3]);
    expect(census.inclusionProbabilities).toEqual([1, 1, 1, 1]);
    expect(census.probabilitySummary).toMatchObject({ certaintyUnitCount: 4, probabilitySum: 4 });
    // n>N 在抽样层被封顶为普查（路由在更早处拒绝），无正规模值则无可用设计
    const clamped = performPPSSampling(handPpsData, "size", 5, () => 0);
    expect(clamped.indices).toEqual([0, 1, 2, 3]);
    expect(clamped.inclusionProbabilities).toEqual([1, 1, 1, 1]);
    expect(performPPSSampling([{ y: 1, size: 0 }], "size", 1, () => 0).data).toEqual([]);
});
