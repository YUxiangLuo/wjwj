import { expect, test } from "bun:test";
import { createSeededRandom, performSimpleSampling, performSystematicSampling } from "./sampling";

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

test("systematic sampling is deterministic with same seed", async () => {
    const seed = 42;
    const first = await performSystematicSampling(population, 5, createSeededRandom(seed));
    const second = await performSystematicSampling(population, 5, createSeededRandom(seed));

    expect(first).toEqual(second);
});
