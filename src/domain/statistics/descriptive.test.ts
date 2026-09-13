import { expect, test } from "bun:test";
import { describeVariable } from "./descriptive";
import type { VariableDefinition } from "../experiment/variable-dictionary";
const numeric: VariableDefinition = { id: "v_2", sourceField: " x ", label: "数值", unit: "分钟", storageType: "number", measurementLevel: "continuous", missingValues: [-99], categories: [] };
const category: VariableDefinition = { ...numeric, storageType: "text", measurementLevel: "nominal", categories: ["01", "1", 1, false, 0].map(value => ({ value, label: JSON.stringify([typeof value, value]) })) };
test("raw numeric descriptions use valid n-1 and type7 quartiles; zero and declared missing stay distinct", () => {
    const r = describeVariable(numeric, [0, 2, 4, 6, 8, -99, null, " "], null);
    expect(r).toMatchObject({ sampleCount: 8, validCount: 5, missingCount: 3, mean: 4, min: 0, q1: 2, median: 4, q3: 6, max: 8 });
    expect(r.sampleSD).toBeCloseTo(Math.sqrt(10), 13);
    const even = describeVariable(numeric, [1, 2, 3, 4], null); expect([even.q1, even.median, even.q3]).toEqual([1.75, 2.5, 3.25]);
});
test("one/zero valid rows have explicitly unavailable statistics, not fabricated zeros", () => {
    expect(describeVariable(numeric, [5, null], null)).toMatchObject({ mean: 5, sampleSD: null, median: 5 });
    expect(describeVariable(numeric, [null, -99, ""], null)).toMatchObject({ mean: null, sampleSD: null, median: null, validCount: 0 });
    expect(describeVariable(numeric, [0, 0, 0], null)).toMatchObject({ mean: 0, sampleSD: 0 });
});
test("typed categories are never combined and unobserved declared categories remain zero", () => {
    const r = describeVariable(category, ["01", "1", 1, false, 0, false, -99], null);
    expect(r.categories.map(c => c.count)).toEqual([1, 1, 1, 2, 1]); expect(r.validCount).toBe(6); expect(r.mean).toBeNull();
    expect(r.categories[3]!.proportion).toBe(2 / 6);
    expect(describeVariable(category, ["01"], null).categories[4]).toMatchObject({ count: 0, proportion: 0 });
    expect(describeVariable(category, [null], null).categories.every(c => c.proportion === null)).toBe(true);
});
test("design ratio means and proportions retain original counts; no weighted SD or quartiles", () => {
    expect(describeVariable(numeric, [10, 20], [2, 6])).toMatchObject({ mean: 17.5, weightSum: 8, sampleSD: null, median: null });
    const r = describeVariable(category, ["01", false, false], [8, 1, 1]);
    expect(r.categories[0]).toMatchObject({ count: 1, proportion: .8 }); expect(r.categories[3]).toMatchObject({ count: 2, proportion: .2 });
});
for (const values of [["1"], [Infinity], [NaN], [false], [{}]]) test(`continuous rejects nonnumeric rather than coercing: ${JSON.stringify(values)}`, () => expect(() => describeVariable(numeric, values, null)).toThrow());
for (const weights of [[1], [0, 2], [-1, 2], [NaN, 2], [Infinity, 2]]) test(`invalid weights rejected: ${JSON.stringify(weights)}`, () => expect(() => describeVariable(numeric, [1, 2], weights)).toThrow());
test("missing observations never trigger design-weight renormalization", () => expect(() => describeVariable(numeric, [1, -99], [2, 2])).toThrow("缺失"));
test("unknown categories, identifiers and unclassified fields cannot masquerade as measurements", () => {
    expect(() => describeVariable(category, ["unknown"], null)).toThrow("未被字典声明");
    for (const measurementLevel of ["id", "unclassified"] as const) expect(() => describeVariable({ ...numeric, measurementLevel }, [1], null)).toThrow("标识符");
});
test("scaled calculations avoid overflow and do not drop small cancellation terms", () => {
    const r = describeVariable(numeric, [1e308, 1, -1e308], null); expect(r.mean).toBeCloseTo(1 / 3, 14); expect(Number.isFinite(r.sampleSD)).toBe(true);
    expect(describeVariable(numeric, [5e-324, 5e-324], null)).toMatchObject({ mean: 5e-324, median: 5e-324, sampleSD: 0 });
    expect(() => describeVariable(numeric, [1e308, 1e-308], null)).toThrow("跨度");
    expect(() => describeVariable(numeric, [-Number.MAX_VALUE, Number.MAX_VALUE], null)).toThrow("尺度");
});
test("unrepresentable nonzero means and quartiles never silently become zero", () => {
    expect(() => describeVariable(numeric, [Number.MIN_VALUE, 0], null)).toThrow();
    expect(() => describeVariable(numeric, [Number.MIN_VALUE, 0], [1, 1])).toThrow();
    expect(() => describeVariable(numeric, [-Number.MIN_VALUE, 0, Number.MIN_VALUE], null)).toThrow();
});
test("100000 observations do not use argument-spread or displayed subsamples", () => {
    const r = describeVariable(numeric, Array.from({ length: 100_000 }, (_, i) => i), null);
    expect(r.mean).toBeCloseTo(49999.5, 8); expect(r.median).toBe(49999.5); expect(r.validCount).toBe(100_000);
});
