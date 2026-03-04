import { expect, test } from "bun:test";
import { createSeededRandom, performSimpleSampling, performStratifiedSampling, performSystematicSampling } from "./sampling";

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
    const first = await performSystematicSampling(population, 5, createSeededRandom(seed));
    const second = await performSystematicSampling(population, 5, createSeededRandom(seed));

    expect(first).toEqual(second);
});

test("systematic sampling with step=1 returns all items", async () => {
    const result = await performSystematicSampling(population, 1, createSeededRandom("step1"));
    expect(result.length).toBe(population.length);
});

test("systematic sampling on empty population returns empty array", async () => {
    const result = await performSystematicSampling([], 3, createSeededRandom("empty-sys"));
    expect(result).toEqual([]);
});

test("systematic sampling step larger than population returns at most one item", async () => {
    const result = await performSystematicSampling(population, 100, createSeededRandom("large-step"));
    expect(result.length).toBeLessThanOrEqual(1);
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
