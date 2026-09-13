import { expect, test } from "bun:test";
import { calculateUnivariate } from "./analysis";
import { interpretNumeric, suggestDictionary, validateDictionary, valueKey } from "./dictionary";
import type { VariableDefinition } from "./types";

const categorical: VariableDefinition = {
    field: "x", label: "编码", unit: "", kind: "nominal",
    categories: ["01", "1", 1, false, 0].map(value => ({ value, label: String(value) })), missing: [null],
};
const continuous: VariableDefinition = { field: "x", label: "数值", unit: "分", kind: "continuous", categories: [], missing: [null, "NA"] };

test("typed category keys preserve text, number, false and zero", () => {
    expect(new Set(["01", "1", 1, false, 0].map(valueKey)).size).toBe(5);
    const result = calculateUnivariate({ population: ["01", "1", 1, false, 0, null].map(x => ({ x })), indices: [0, 1, 2, 3, 4, 5], variable: categorical, weighted: false });
    expect(result).toMatchObject({ kind: "categorical", validCount: 5, missingCount: 1 });
    if (result.kind === "categorical") expect(result.categories.map(c => [c.count, c.proportion])).toEqual(Array(5).fill([1, .2]));
});

test("suggestions do not infer numeric-looking text as continuous and validation is strict", () => {
    const rows = [{ code: "01" }, { code: "1" }, { code: 1 }, { code: false }, { code: 0 }, { code: null }];
    const dictionary = suggestDictionary(rows, "population.csv", 1);
    expect(dictionary.variables[0]).toMatchObject({ kind: "nominal", missing: [null] });
    expect(dictionary.variables[0]!.categories).toHaveLength(5);
    expect(validateDictionary(dictionary, rows, "population.csv")).toEqual(dictionary);
    expect(() => validateDictionary({ ...dictionary, extra: true }, rows, "population.csv")).toThrow("未知字段");
    expect(() => validateDictionary({ ...dictionary, variables: [{ ...dictionary.variables[0]!, categories: [] }] }, rows, "population.csv")).toThrow("未覆盖完整总体");
});

test("explicit continuous variables parse CSV numeric text but reject invalid non-missing values", () => {
    expect(interpretNumeric("１,200", continuous)).toBe(1200);
    expect(interpretNumeric("NA", continuous)).toBeNull();
    expect(() => interpretNumeric("bad", continuous)).toThrow("无法解释");
});

test("unweighted numeric description uses R7, n-1 SD, and null for unavailable statistics", () => {
    const population = [0, 10, 20, 30, null].map(x => ({ x }));
    const result = calculateUnivariate({ population, indices: [0, 1, 2, 3, 4], variable: continuous, weighted: false });
    expect(result).toMatchObject({ kind: "numeric", weighted: false, sampleCount: 5, validCount: 4, missingCount: 1,
        mean: 15, min: 0, max: 30, q1: 7.5, median: 15, q3: 22.5 });
    if (result.kind === "numeric") expect(result.sampleStandardDeviation).toBeCloseTo(Math.sqrt(500 / 3), 14);
    const one = calculateUnivariate({ population, indices: [1, 4], variable: continuous, weighted: false });
    expect(one).toMatchObject({ mean: 10, sampleStandardDeviation: null, min: 10, q1: 10, median: 10, q3: 10, max: 10 });
});

test("weighted results use asymmetric ratio estimates but retain raw category counts", () => {
    const numeric = calculateUnivariate({ population: [{ x: 0 }, { x: 10 }], indices: [0, 1], variable: continuous, weighted: true, weights: [9, 1] });
    expect(numeric).toMatchObject({ kind: "numeric", sampleStandardDeviation: null, min: null, q1: null, median: null, q3: null, max: null });
    if (numeric.kind === "numeric") expect(numeric.mean).toBeCloseTo(1, 14);
    const variable: VariableDefinition = { field: "x", label: "组", unit: "", kind: "nominal", categories: [{ value: "A", label: "甲" }, { value: "B", label: "乙" }], missing: [] };
    const result = calculateUnivariate({ population: [{ x: "A" }, { x: "B" }], indices: [0, 1], variable, weighted: true, weights: [9, 1] });
    if (result.kind !== "categorical") throw new Error("expected categorical result");
    expect(result.categories.map(category => [category.value, category.label, category.count])).toEqual([["A", "甲", 1], ["B", "乙", 1]]);
    expect(result.categories[0]!.proportion).toBeCloseTo(.9, 14);
    expect(result.categories[1]!.proportion).toBeCloseTo(.1, 14);
});

test("weighted analysis rejects population missingness and numeric overflow is explicit", () => {
    expect(() => calculateUnivariate({ population: [{ x: 1 }, { x: null }], indices: [0], variable: continuous, weighted: true, weights: [1] })).toThrow("完整总体");
    expect(() => calculateUnivariate({ population: [{ x: -Number.MAX_VALUE }, { x: Number.MAX_VALUE }], indices: [0, 1], variable: continuous, weighted: false })).toThrow("数值溢出");
});
