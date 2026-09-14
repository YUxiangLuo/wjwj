import { expect, test } from "bun:test";
import { calculateUnivariate } from "./analysis";
import type { NumericAnalysisResult, VariableDefinition } from "./types";

// docs/VARIABLE_ANALYSIS_TEST_PLAN.md §6 补充属性测试（P1）。
// 输入生成器带独立 mulberry32，与生产随机流无关；断言失败时带上种子与迭代号。

function mulberry32(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SEED = 20260914;
const ITERATIONS = 150;
const continuous: VariableDefinition = { field: "y", label: "值", unit: "", kind: "continuous", categories: [], missing: [] };

function numeric(input: Parameters<typeof calculateUnivariate>[0], context: string): NumericAnalysisResult {
    const result = calculateUnivariate(input);
    if (result.kind !== "numeric") throw new Error(`${context}: expected numeric result`);
    return result;
}

function expectRelative(actual: number | null, expected: number, context: string) {
    if (actual === null || !Number.isFinite(actual)) throw new Error(`${context}: expected finite ${expected}, got ${actual}`);
    const tolerance = 1e-9 * Math.max(1, Math.abs(expected));
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`${context}: expected ${expected}, got ${actual} (tolerance ${tolerance})`);
    }
}

function shuffle<T>(values: T[], random: () => number) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [result[index], result[swap]] = [result[swap]!, result[index]!];
    }
    return result;
}

test("numeric results are invariant under sample reordering, pair reordering and weight scaling", () => {
    const random = mulberry32(SEED);
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const context = `seed=${SEED} iteration=${iteration}`;
        const count = 2 + Math.floor(random() * 11);
        const scale = 10 ** (Math.floor(random() * 13) - 6);
        const values = Array.from({ length: count }, () => Number(((random() * 2 - 1) * scale).toFixed(6)));
        const weights = Array.from({ length: count }, () => 0.001 + random() * 1000);
        const population = values.map(value => ({ y: value }));
        const indices = values.map((_, index) => index);

        const base = numeric({ population, indices, variable: continuous, weighted: false }, context);
        const reordered = numeric({ population, indices: shuffle(indices, random), variable: continuous, weighted: false }, `${context} reorder`);
        for (const key of ["mean", "sampleStandardDeviation", "q1", "median", "q3", "min", "max"] as const) {
            const expected = base[key];
            const actual = reordered[key];
            if (expected === null) expect(actual).toBeNull();
            else expectRelative(actual, expected, `${context} reorder ${key}`);
        }

        const weighted = numeric({ population, indices, variable: continuous, weighted: true, weights }, `${context} weighted`);
        const permutation = shuffle(indices, random);
        const permuted = numeric({
            population: permutation.map(index => population[index]!),
            indices,
            variable: continuous,
            weighted: true,
            weights: permutation.map(index => weights[index]!),
        }, `${context} pair reorder`);
        expectRelative(permuted.mean, weighted.mean!, `${context} pair reorder mean`);

        const factor = 0.001 + random() * 1000;
        const rescaled = numeric({ population, indices, variable: continuous, weighted: true, weights: weights.map(weight => weight * factor) }, `${context} weight scale`);
        expectRelative(rescaled.mean, weighted.mean!, `${context} weight scale mean`);

        // 正比例单位变换：均值/SD/分位数同倍缩放
        const unit = 100;
        const transformed = numeric({ population: values.map(value => ({ y: value * unit })), indices, variable: continuous, weighted: false }, `${context} unit`);
        for (const key of ["mean", "sampleStandardDeviation", "q1", "median", "q3", "min", "max"] as const) {
            expectRelative(transformed[key], base[key]! * unit, `${context} unit ${key}`);
        }
        expect(JSON.stringify(transformed)).not.toMatch(/NaN|Infinity/);
    }
});

test("categorical counts and denominators stay internally consistent", () => {
    const random = mulberry32(SEED + 1);
    const categories = ["甲", "乙", "丙"];
    const variable: VariableDefinition = {
        field: "g", label: "组", unit: "", kind: "nominal",
        categories: categories.map(value => ({ value, label: value })), missing: [null],
    };
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        const context = `seed=${SEED + 1} iteration=${iteration}`;
        const count = 1 + Math.floor(random() * 12);
        const weighted = random() < 0.5;
        // 加权口径要求整个总体目标字段无缺失（有意 fail closed），未加权才注入缺失
        const rows = Array.from({ length: count }, () => ({ g: !weighted && random() < 0.25 ? null : categories[Math.floor(random() * categories.length)] }));
        const sampleSize = 1 + Math.floor(random() * count);
        const indices = shuffle(rows.map((_, index) => index), random).slice(0, sampleSize);
        const weights = indices.map(() => 0.1 + random() * 10);
        const result = calculateUnivariate({ population: rows, indices, variable, weighted, weights: weighted ? weights : undefined });
        if (result.kind !== "categorical") throw new Error(`${context}: expected categorical result`);

        expect(result.validCount + result.missingCount, context).toBe(sampleSize);
        expect(result.categories.reduce((sum, category) => sum + category.count, 0), context).toBe(result.validCount);
        expect(result.categories.map(category => category.value), context).toEqual(categories);
        const observed = rows.filter((row, index) => indices.includes(index) && row.g !== null).length;
        expect(result.validCount, context).toBe(observed);
        const proportionSum = result.categories.reduce((sum, category) => sum + (category.proportion ?? 0), 0);
        if (result.validCount > 0) expectRelative(proportionSum, 1, `${context} proportion sum`);
    }
});
