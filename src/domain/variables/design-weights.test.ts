import { expect, test } from "bun:test";
import { calculateDesignWeights } from "./design-weights";

test("PPS uses nonuniform inverse inclusion probabilities", () => {
    expect(calculateDesignWeights({ method: "pps", inclusionProbabilities: [.25, .5, 1] }, [{}, {}, {}], [0, 1, 2]))
        .toEqual([4, 2, 1]);
});

test("unequal stratification uses Nh/nh and covers every layer", () => {
    const rows = [{ g: "A" }, { g: "A" }, { g: "A" }, { g: "B" }];
    expect(calculateDesignWeights({ method: "stratified", stratifyBy: "g", layers: [
        { name: "A", count: 3, sampleCount: 1 }, { name: "B", count: 1, sampleCount: 1 },
    ] }, rows, [0, 3])).toEqual([3, 1]);
    expect(() => calculateDesignWeights({ method: "stratified", stratifyBy: "g", layers: [
        { name: "A", count: 3, sampleCount: 1 },
    ] }, rows, [0])).toThrow("完整总体");
});

test("simple and systematic weights are N/n and invalid PPS is rejected", () => {
    expect(calculateDesignWeights({ method: "simple", populationSize: 4, sampleCount: 2 }, [{}, {}, {}, {}], [0, 2]))
        .toEqual([2, 2]);
    expect(() => calculateDesignWeights({ method: "pps", inclusionProbabilities: [0] }, [{}], [0])).toThrow("有限正数");
});
