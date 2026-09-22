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

test("suggestions honor authoritative identifier and numeric field roles", () => {
    const rows = [
        { id: "D001", score: 10, group: "A" },
        { id: "D002", score: 20, group: "B" },
    ];
    const dictionary = suggestDictionary(rows, "population.csv", 1, {
        identifier: "id",
        numeric: ["score"],
    });

    expect(dictionary.variables.map(variable => [variable.field, variable.kind, variable.categories.length])).toEqual([
        ["id", "identifier", 0],
        ["score", "continuous", 0],
        ["group", "nominal", 2],
    ]);
    expect(validateDictionary(dictionary, rows, "population.csv")).toEqual(dictionary);
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

// ---------------------------------------------------------------------------
// 类型、非对称连续、非等权及全总体夹具。
// 期望值全部由夹具定义独立推导，未调用被测函数生成。
// ---------------------------------------------------------------------------

const univariate = (input: Parameters<typeof calculateUnivariate>[0]) => {
    const result = calculateUnivariate(input);
    if (result.kind !== "numeric") throw new Error("expected numeric result");
    return result;
};

const categoricalResult = (input: Parameters<typeof calculateUnivariate>[0]) => {
    const result = calculateUnivariate(input);
    if (result.kind !== "categorical") throw new Error("expected categorical result");
    return result;
};

test("F1 typed categories keep text/number/boolean/zero separate and divide by the valid count", () => {
    const rows = ["01", "1", 1, false, 0, "01", null].map(x => ({ x }));
    const result = categoricalResult({ population: rows, indices: rows.map((_, index) => index), variable: categorical, weighted: false });

    expect(result).toMatchObject({ sampleCount: 7, validCount: 6, missingCount: 1 });
    // 字典顺序即原值顺序："01", "1", 1, false, 0
    expect(result.categories.map(category => category.count)).toEqual([2, 1, 1, 1, 1]);
    expect(result.categories.map(category => category.proportion)).toEqual([2 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6]);
    expect(result.categories.map(category => [typeof category.value, category.value])).toEqual([
        ["string", "01"], ["string", "1"], ["number", 1], ["boolean", false], ["number", 0],
    ]);
});

test("F2 asymmetric continuous fixture matches the hand-derived mean, n-1 SD and R7 quantiles", () => {
    const rows = [0, 2, 9, 21, null].map(x => ({ x }));
    // 均值 (0+2+9+21)/4 = 8；样本方差 (64+36+1+169)/3 = 90
    // R7 位置 0.75/1.5/2.25 → Q1 1.5、中位数 5.5、Q3 12
    const result = univariate({ population: rows, indices: [0, 1, 2, 3, 4], variable: continuous, weighted: false });
    expect(result).toMatchObject({ mean: 8, min: 0, max: 21, validCount: 4, missingCount: 1 });
    // R7 定标归一化带来 ≤2e-16 相对误差；按计划 §3 的浮点容差断言，不锁定十进制字面量
    expect(result.q1).toBeCloseTo(1.5, 12);
    expect(result.median).toBeCloseTo(5.5, 12);
    expect(result.q3).toBeCloseTo(12, 12);
    expect(result.sampleStandardDeviation).toBeCloseTo(Math.sqrt(90), 12);
});

test("F3 weighted mean divides by the weight sum and stays distinct from the raw mean", () => {
    const rows = [2, 10, 40].map(x => ({ x }));
    // (6·2 + 3·10 + 1·40) / 10 = 8.2；(2+10+40)/3 = 17.33…
    const weighted = univariate({ population: rows, indices: [0, 1, 2], variable: continuous, weighted: true, weights: [6, 3, 1] });
    const raw = univariate({ population: rows, indices: [0, 1, 2], variable: continuous, weighted: false });
    expect(weighted.mean).toBeCloseTo(8.2, 14);
    expect(raw.mean).toBeCloseTo(52 / 3, 14);
    expect(weighted.mean).not.toBeCloseTo(52 / 3, 6);
});

test("F4 weighted categorical proportions honour weights while counts stay raw", () => {
    const variable: VariableDefinition = { field: "x", label: "组", unit: "", kind: "nominal", categories: [{ value: "A", label: "甲" }, { value: "B", label: "乙" }], missing: [] };
    const rows = [{ x: "A" }, { x: "B" }, { x: "B" }];
    const result = categoricalResult({ population: rows, indices: [0, 1, 2], variable, weighted: true, weights: [6, 3, 1] });
    expect(result.categories.map(category => category.count)).toEqual([1, 2]);
    expect(result.categories[0]!.proportion).toBeCloseTo(0.6, 14);
    expect(result.categories[1]!.proportion).toBeCloseTo(0.4, 14);
    // 原始比例 1/3、2/3 不得冒充加权比例
    expect(result.categories[0]!.proportion).not.toBeCloseTo(1 / 3, 6);
});

test("F7 the last out-of-sample population row is invisible to raw samples but blocks weighted analysis", () => {
    const variable: VariableDefinition = { field: "x", label: "组", unit: "", kind: "nominal", categories: [{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }], missing: [null] };
    // 第 4 行（索引 3）不在样本 [0,1] 中：字典外类别只应影响全总体校验
    const external = [{ x: "A" }, { x: "B" }, { x: "C" }, { x: "D" }];
    expect(categoricalResult({ population: external, indices: [0, 1], variable, weighted: false })).toMatchObject({ validCount: 2 });
    expect(() => calculateUnivariate({ population: external, indices: [0, 1], variable, weighted: true, weights: [1, 1] })).toThrow(/字典外类别/);

    // 同一位置换成缺失编码：原始描述可运行，加权必须显式拒绝
    const missingLast = [{ x: "A" }, { x: "B" }, { x: "C" }, { x: null }];
    expect(categoricalResult({ population: missingLast, indices: [0, 1], variable, weighted: false })).toMatchObject({ validCount: 2 });
    expect(() => calculateUnivariate({ population: missingLast, indices: [0, 1], variable, weighted: true, weights: [1, 1] })).toThrow(/完整总体/);
});

test("A01 unavailable statistics stay null, zero-frequency categories keep dictionary order", () => {
    const allMissing = univariate({ population: [{ x: null }, { x: null }], indices: [0, 1], variable: continuous, weighted: false });
    expect(allMissing).toMatchObject({ mean: null, sampleStandardDeviation: null, min: null, max: null, q1: null, median: null, q3: null, validCount: 0, missingCount: 2 });

    const single = univariate({ population: [{ x: 5 }], indices: [0], variable: continuous, weighted: false });
    expect(single).toMatchObject({ mean: 5, sampleStandardDeviation: null, min: 5, max: 5, q1: 5, median: 5, q3: 5 });

    const allZero = univariate({ population: [{ x: 0 }, { x: 0 }, { x: 0 }], indices: [0, 1, 2], variable: continuous, weighted: false });
    expect(allZero).toMatchObject({ mean: 0, sampleStandardDeviation: 0, min: 0, max: 0, q1: 0, median: 0, q3: 0 });

    const constant = univariate({ population: [{ x: 7 }, { x: 7 }, { x: 7 }], indices: [0, 1, 2], variable: continuous, weighted: false });
    expect(constant).toMatchObject({ mean: 7, sampleStandardDeviation: 0, min: 7, max: 7 });

    const variable: VariableDefinition = { field: "x", label: "组", unit: "", kind: "nominal", categories: [{ value: "A", label: "A" }, { value: "B", label: "B" }, { value: "C", label: "C" }], missing: [] };
    const zeroFrequency = categoricalResult({ population: [{ x: "A" }], indices: [0], variable, weighted: false });
    expect(zeroFrequency.categories.map(category => category.value)).toEqual(["A", "B", "C"]);
    expect(zeroFrequency.categories.map(category => category.count)).toEqual([1, 0, 0]);
    expect(zeroFrequency.categories.map(category => category.proportion)).toEqual([1, 0, 0]);
});

test("A02 extreme scales are reliable or explicitly rejected, never NaN/Infinity", () => {
    // 对称大数：均值 0，SD = √2·1e300 仍可表示
    const pair = univariate({ population: [{ x: -1e300 }, { x: 1e300 }], indices: [0, 1], variable: continuous, weighted: false });
    expect(pair.mean).toBe(0);
    expect(pair.sampleStandardDeviation).toBeCloseTo(Math.SQRT2 * 1e300, -290);

    // 接近浮点上限的常量：均值可表示，SD 为 0
    const maxPair = univariate({ population: [{ x: Number.MAX_VALUE }, { x: Number.MAX_VALUE }], indices: [0, 1], variable: continuous, weighted: false });
    expect(maxPair.mean).toBe(Number.MAX_VALUE);
    expect(maxPair.sampleStandardDeviation).toBe(0);

    // 无法可靠表达的 SD 必须显式报错
    expect(() => calculateUnivariate({ population: [{ x: -Number.MAX_VALUE }, { x: Number.MAX_VALUE }], indices: [0, 1], variable: continuous, weighted: false })).toThrow(/数值溢出/);

    // 极小尺度：不得下溢成假零
    const tiny = univariate({ population: [{ x: 1e-320 }, { x: 2e-320 }], indices: [0, 1], variable: continuous, weighted: false });
    expect(Number.isFinite(tiny.mean!)).toBe(true);
    expect(tiny.mean!).toBeGreaterThan(0);
    expect(tiny.mean!).toBeLessThanOrEqual(2e-320);

    // 高动态范围权重：值/权重同尺度归一化后仍应得到 2
    const weighted = univariate({ population: [{ x: 1 }, { x: 1e300 }], indices: [0, 1], variable: continuous, weighted: true, weights: [1e300, 1] });
    expect(weighted.mean).toBeCloseTo(2, 12);
    expect(JSON.stringify(weighted)).not.toMatch(/NaN|Infinity/);
    expect(JSON.stringify(tiny)).not.toMatch(/NaN|Infinity/);
});

// ---------------------------------------------------------------------------
// 全总体字典校验与类别上限。
// ---------------------------------------------------------------------------

const baseVariable = (overrides: Partial<VariableDefinition> = {}): VariableDefinition => ({
    field: "x", label: "标签", unit: "", kind: "nominal", categories: [{ value: "A", label: "A" }], missing: [null], ...overrides,
});
const dictOf = (variables: VariableDefinition[], source = "population.csv", revision = 1) => ({ source, revision, variables });

test("D02 rejects duplicate, missing and extra fields against the complete population", () => {
    const rows = [{ x: "A", y: "B" }];
    expect(() => validateDictionary(dictOf([baseVariable(), baseVariable()]), rows, "population.csv")).toThrow(/缺失、重复或不存在/);
    expect(() => validateDictionary(dictOf([baseVariable()]), rows, "population.csv")).toThrow(/完整覆盖总体字段/);
    expect(() => validateDictionary(dictOf([baseVariable(), baseVariable({ field: "ghost", categories: [{ value: "Z", label: "Z" }], missing: [] })]), rows, "population.csv")).toThrow(/缺失、重复或不存在/);
    expect(() => validateDictionary(dictOf([baseVariable({ label: "" }), baseVariable({ field: "y", categories: [{ value: "B", label: "B" }], missing: [] })]), rows, "population.csv")).toThrow(/标签或单位无效/);
});

test("D02 rejects conflicting missing codes, invalid kinds and uncovered categories", () => {
    const rows = [{ x: "A" }, { x: "B" }];
    const withCategories = (values: string[], missing: unknown[] = [null]) => baseVariable({ categories: values.map(value => ({ value, label: value })), missing: missing as VariableDefinition["missing"] });
    expect(() => validateDictionary(dictOf([withCategories(["A", "B"], [null, null])]), rows, "population.csv")).toThrow(/重复缺失编码/);
    // 同一编码既当有效类别又当缺失编码：必须拒绝，不得静默按其中一种解释
    expect(() => validateDictionary(dictOf([baseVariable({ categories: [{ value: "A", label: "A" }], missing: ["A"] })]), rows, "population.csv")).toThrow(/类别与缺失编码重复或冲突/);
    expect(() => validateDictionary(dictOf([baseVariable({ kind: "continuous", categories: [{ value: "A", label: "A" }] })]), rows, "population.csv")).toThrow(/不能定义类别/);
    expect(() => validateDictionary(dictOf([baseVariable({ kind: "identifier", categories: [{ value: "A", label: "A" }] })]), rows, "population.csv")).toThrow(/不能定义类别/);
    expect(() => validateDictionary(dictOf([baseVariable({ kind: "weird" as VariableDefinition["kind"] })]), rows, "population.csv")).toThrow(/测量类型无效/);
    // 观察到的类别不在字典中：校验必须覆盖完整总体，而不只是预览行
    expect(() => validateDictionary(dictOf([withCategories(["A"])]), rows, "population.csv")).toThrow(/未覆盖完整总体/);
});

test("D06 enforces the 200-category boundary and marks larger fields as not-for-analysis", () => {
    const twoHundred = Array.from({ length: 200 }, (_, index) => `c${index}`);
    const rows200 = twoHundred.map(code => ({ code }));
    const suggested200 = suggestDictionary(rows200, "population.csv", 1);
    expect(suggested200.variables[0]).toMatchObject({ kind: "nominal" });
    expect(suggested200.variables[0]!.categories).toHaveLength(200);
    expect(validateDictionary(suggested200, rows200, "population.csv")).toEqual(suggested200);

    const rows201 = [...twoHundred, "c200"].map(code => ({ code }));
    const suggested201 = suggestDictionary(rows201, "population.csv", 1);
    expect(suggested201.variables[0]).toMatchObject({ kind: "identifier", categories: [] });

    // 显式确认 201 个分类必须被拒绝，而不是静默截断
    const oversize = dictOf([baseVariable({ field: "code", categories: rows201.map(row => ({ value: row.code, label: row.code })) })]);
    expect(() => validateDictionary(oversize, rows201, "population.csv")).toThrow(/类别超过 200 个限制/);
});

test("D02 rejects source and revision mismatches before any write", () => {
    const rows = [{ x: "A" }];
    expect(() => validateDictionary(dictOf([baseVariable()], "other.csv"), rows, "population.csv")).toThrow(/数据来源不匹配/);
    expect(() => validateDictionary(dictOf([baseVariable()], "population.csv", -1), rows, "population.csv")).toThrow(/修订号无效/);
    expect(() => validateDictionary({ ...dictOf([baseVariable()]), extra: true }, rows, "population.csv")).toThrow(/未知字段/);
});
