import { expect, test } from "bun:test";
import { calculateUnivariate } from "./analysis";
import { calculateDesignWeights } from "./design-weights";
import type { VariableDefinition } from "./types";

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

// ---------------------------------------------------------------------------
// 非比例分层与 PPS 权重边界夹具。
// F5：A 层 N=6、n=1；B 层 N=4、n=2；权重应为 [6,2,2]，比率均值 11.2（非总 N/n）。
// ---------------------------------------------------------------------------

const unequalRows = [
    { g: "A", y: 2 }, { g: "A", y: 50 }, { g: "A", y: 51 },
    { g: "A", y: 52 }, { g: "A", y: 53 }, { g: "A", y: 54 },
    { g: "B", y: 10 }, { g: "B", y: 40 }, { g: "B", y: 60 }, { g: "B", y: 70 },
];
const unequalLayers = [
    { name: "A", count: 6, sampleCount: 1 },
    { name: "B", count: 4, sampleCount: 2 },
];
const yVariable: VariableDefinition = { field: "y", label: "值", unit: "", kind: "continuous", categories: [], missing: [] };

test("F5 non-proportional stratification uses Nh/nh weights and the ratio mean", () => {
    const design = { method: "stratified" as const, stratifyBy: "g", layers: unequalLayers };
    const weights = calculateDesignWeights(design, unequalRows, [0, 6, 7]);
    expect(weights).toEqual([6, 2, 2]);
    // 总 N/n = 10/3 会得到 (2+10+40)/3；Nh/nh 必须得到 (6·2+2·10+2·40)/10 = 11.2
    const result = calculateUnivariate({ population: unequalRows, indices: [0, 6, 7], variable: yVariable, weighted: true, weights });
    if (result.kind !== "numeric") throw new Error("expected numeric result");
    expect(result.mean).toBeCloseTo(11.2, 12);
});

test("F6 inclusion probabilities outside (0,1] and malformed weight inputs are rejected", () => {
    const rows = [{}, {}, {}];
    // 1/π 而非 π；必入单元 π=1 → 权重 1
    expect(calculateDesignWeights({ method: "pps", inclusionProbabilities: [0.25, 0.5, 1] }, rows, [0, 1, 2])).toEqual([4, 2, 1]);
    const invalid = [0, -0.5, 1.0000001, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined as unknown as number];
    for (const probability of invalid) {
        expect(() => calculateDesignWeights({ method: "pps", inclusionProbabilities: [probability] }, [{}], [0])).toThrow(/有限正数/);
    }
    // 概率数组与样本长度不符时不得静默接受
    expect(() => calculateDesignWeights({ method: "pps", inclusionProbabilities: [0.5, 0.5] }, rows, [0])).toThrow(/样本不一致/);
});
