import { describe, expect, test } from "bun:test";
import { computeSimpleRandomValueSe } from "../statistics/srs";
import { scaledMean } from "../statistics/values";
import { calculateCrossTab, calculateUnivariate } from "./analysis";
import type { VariableDefinition } from "./types";

function mulberry32(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
}

describe("Subgroup cross-tab (calculateCrossTab) adversarial & mathematical regressions", () => {
    test("hand-derived weighted & unweighted subgroup means, SDs and categorical proportions", () => {
        const groupVar: VariableDefinition = {
            field: "tier",
            label: "客群分层",
            unit: "",
            kind: "ordinal",
            categories: [
                { value: "A", label: "甲层" },
                { value: "B", label: "乙层" },
                { value: "C", label: "空层" },
            ],
            missing: [null],
        };
        const numTarget: VariableDefinition = {
            field: "spend",
            label: "消费额",
            unit: "元",
            kind: "continuous",
            categories: [],
            missing: [-1, null],
        };
        const catTarget: VariableDefinition = {
            field: "plan",
            label: "套餐",
            unit: "",
            kind: "nominal",
            categories: [
                { value: "pro", label: "专业版" },
                { value: "free", label: "免费版" },
            ],
            missing: ["NA"],
        };

        const rows = [
            { tier: "A", spend: 10, plan: "pro" },   // idx 0, w=6
            { tier: "A", spend: 40, plan: "free" },  // idx 1, w=2
            { tier: "B", spend: 25, plan: "pro" },   // idx 2, w=5 (singleton in B -> SD=null)
            { tier: "A", spend: -1, plan: "NA" },    // idx 3, target missing
            { tier: null, spend: 99, plan: "pro" },  // idx 4, group missing
        ];
        const indices = [0, 1, 2, 3, 4];
        const weights = [6, 2, 5, 10, 10];

        const rawNum = calculateCrossTab({
            rows,
            indices,
            variable: numTarget,
            groupVariable: groupVar,
            weighted: false,
        });
        expect(rawNum.sampleCount).toBe(5);
        expect(rawNum.validCount).toBe(3);
        expect(rawNum.missingCount).toBe(2);
        expect(rawNum.groups[0]).toMatchObject({
            groupValue: "A",
            validCount: 2,
            mean: 25,
        });
        expect(rawNum.groups[0]!.sampleStandardDeviation!).toBeCloseTo(Math.sqrt(450), 12);
        expect(rawNum.groups[1]).toEqual({
            groupValue: "B",
            groupLabel: "乙层",
            validCount: 1,
            mean: 25,
            sampleStandardDeviation: null,
        });
        expect(rawNum.groups[2]).toEqual({
            groupValue: "C",
            groupLabel: "空层",
            validCount: 0,
            mean: null,
            sampleStandardDeviation: null,
        });

        const weightedNum = calculateCrossTab({
            rows,
            indices,
            variable: numTarget,
            groupVariable: groupVar,
            weighted: true,
            weights,
        });
        // Group A weighted mean: (6*10 + 2*40) / (6 + 2) = 140 / 8 = 17.5
        expect(weightedNum.groups[0]!.mean!).toBeCloseTo(17.5, 12);
        expect(weightedNum.groups[0]!.sampleStandardDeviation).toBeNull();
        expect(weightedNum.groups[1]!.mean!).toBeCloseTo(25, 12);
        expect(weightedNum.groups[2]!.mean).toBeNull();

        const weightedCat = calculateCrossTab({
            rows,
            indices,
            variable: catTarget,
            groupVariable: groupVar,
            weighted: true,
            weights,
        });
        // Group A raw counts [1, 1], weighted proportions [6/8, 2/8] = [0.75, 0.25]
        expect(weightedCat.groups[0]!.categories!.map((c) => c.count)).toEqual([1, 1]);
        expect(weightedCat.groups[0]!.categories![0]!.proportion!).toBeCloseTo(0.75, 12);
        expect(weightedCat.groups[0]!.categories![1]!.proportion!).toBeCloseTo(0.25, 12);
        // Group C empty -> proportions are null
        expect(weightedCat.groups[2]!.categories!.map((c) => [c.count, c.proportion])).toEqual([[0, null], [0, null]]);
    });

    test("preserves null, boolean, numeric 0/-0 and text '0'/'01'/'1' as distinct valid keys on both group and target", () => {
        const typedGroup: VariableDefinition = {
            field: "g",
            label: "类型分组",
            unit: "",
            kind: "nominal",
            categories: [
                { value: null, label: "空值类" },
                { value: false, label: "布尔假" },
                { value: 0, label: "数字零" },
                { value: "0", label: "文本零" },
            ],
            missing: ["MISSING_G"],
        };
        const typedTarget: VariableDefinition = {
            field: "t",
            label: "类型目标",
            unit: "",
            kind: "nominal",
            categories: [
                { value: null, label: "空目标" },
                { value: false, label: "假" },
                { value: 0, label: "零" },
                { value: "01", label: "零一" },
                { value: 1, label: "数字一" },
                { value: "1", label: "文本一" },
            ],
            // Note: null is NOT in missing here; it is a valid target category!
            missing: ["MISSING_T"],
        };

        const rows = [
            { g: null, t: null },
            { g: false, t: false },
            { g: -0, t: -0 },
            { g: "0", t: "01" },
            { g: "0", t: 1 },
            { g: "0", t: "1" },
            { g: "MISSING_G", t: 1 },
            { g: null, t: "MISSING_T" },
        ];

        const res = calculateCrossTab({
            rows,
            indices: rows.map((_, i) => i),
            variable: typedTarget,
            groupVariable: typedGroup,
            weighted: false,
        });
        expect(res.validCount).toBe(6);
        expect(res.missingCount).toBe(2);
        expect(res.groups[0]!.groupValue).toBeNull();
        expect(res.groups[0]!.validCount).toBe(1);
        expect(res.groups[0]!.categories!.map((c) => c.count)).toEqual([1, 0, 0, 0, 0, 0]);
        expect(res.groups[1]!.categories!.map((c) => c.count)).toEqual([0, 1, 0, 0, 0, 0]);
        expect(res.groups[2]!.categories!.map((c) => c.count)).toEqual([0, 0, 1, 0, 0, 0]);
        expect(res.groups[3]!.categories!.map((c) => c.count)).toEqual([0, 0, 0, 1, 1, 1]);
    });

    test("excludes missing categories from group/target output and handles zero-weight strata without NaN", () => {
        const groupWithMissingInCats: VariableDefinition = {
            field: "g",
            label: "组",
            unit: "",
            kind: "nominal",
            categories: [
                { value: "A", label: "A" },
                { value: "B", label: "B" },
                { value: "SKIP", label: "应排除缺失组" },
            ],
            missing: ["SKIP"],
        };
        const catTargetWithMissingInCats: VariableDefinition = {
            field: "c",
            label: "类",
            unit: "",
            kind: "nominal",
            categories: [
                { value: "X", label: "X" },
                { value: "Y", label: "Y" },
                { value: null, label: "应排除空类" },
            ],
            missing: [null],
        };
        const numTarget: VariableDefinition = {
            field: "y",
            label: "值",
            unit: "",
            kind: "continuous",
            categories: [],
            missing: [null],
        };

        const rows = [
            { g: "A", c: "X", y: 10 },
            { g: "A", c: "Y", y: 20 },
            { g: "B", c: "X", y: 100 },
            { g: "B", c: "Y", y: 200 },
            { g: "SKIP", c: "X", y: 999 },
        ];

        // Stratum A has zero weights [0, 0]; Stratum B has weights [1, 3]
        const numRes = calculateCrossTab({
            rows,
            indices: [0, 1, 2, 3, 4],
            variable: numTarget,
            groupVariable: groupWithMissingInCats,
            weighted: true,
            weights: [0, 0, 1, 3, 5],
        });
        expect(numRes.groups.map((g) => g.groupValue)).toEqual(["A", "B"]);
        expect(numRes.groups[0]!.validCount).toBe(2);
        expect(numRes.groups[0]!.mean).toBeNull();
        expect(numRes.groups[1]!.mean!).toBeCloseTo(175, 12);
        expect(JSON.stringify(numRes)).not.toMatch(/NaN|Infinity/);

        const catRes = calculateCrossTab({
            rows,
            indices: [0, 1, 2, 3, 4],
            variable: catTargetWithMissingInCats,
            groupVariable: groupWithMissingInCats,
            weighted: true,
            weights: [0, 0, 1, 3, 5],
        });
        expect(catRes.groups).toHaveLength(2);
        expect(catRes.groups[0]!.categories!.map((c) => [c.value, c.count, c.proportion])).toEqual([
            ["X", 1, null],
            ["Y", 1, null],
        ]);
        expect(catRes.groups[1]!.categories![0]!.proportion!).toBeCloseTo(0.25, 12);
        expect(catRes.groups[1]!.categories![1]!.proportion!).toBeCloseTo(0.75, 12);

        // All zero weights across entire sample -> all proportions/means null, never NaN
        const allZeroCat = calculateCrossTab({
            rows,
            indices: [0, 1],
            variable: catTargetWithMissingInCats,
            groupVariable: groupWithMissingInCats,
            weighted: true,
            weights: [0, 0],
        });
        expect(allZeroCat.groups[0]!.categories!.every((c) => c.proportion === null)).toBe(true);
        expect(JSON.stringify(allZeroCat)).not.toMatch(/NaN|Infinity/);
    });

    test("enforces strict input validation on indices, weights, identifier variables and undeclared categories", () => {
        const gVar: VariableDefinition = {
            field: "g",
            label: "组",
            unit: "",
            kind: "nominal",
            categories: [{ value: "A", label: "A" }],
            missing: [],
        };
        const yVar: VariableDefinition = {
            field: "y",
            label: "值",
            unit: "",
            kind: "continuous",
            categories: [],
            missing: [],
        };
        const idVar: VariableDefinition = {
            field: "id",
            label: "ID",
            unit: "",
            kind: "identifier",
            categories: [],
            missing: [],
        };

        const rows = [{ id: "1", g: "A", y: 10 }];
        expect(() => calculateCrossTab({ rows, indices: [0], variable: idVar, groupVariable: gVar, weighted: false })).toThrow(/标识符/);
        expect(() => calculateCrossTab({ rows, indices: [0], variable: yVar, groupVariable: yVar, weighted: false })).toThrow(/名义或有序/);
        expect(() => calculateCrossTab({ rows, indices: [0], variable: gVar, groupVariable: gVar, weighted: false })).toThrow(/相同/);
        expect(() => calculateCrossTab({ rows, indices: [0], variable: yVar, groupVariable: gVar, weighted: false, weights: [1] })).toThrow(/未加权/);
        expect(() => calculateCrossTab({ rows, indices: [0], variable: yVar, groupVariable: gVar, weighted: true, weights: [-1] })).toThrow(/非负有限数/);
        expect(() => calculateCrossTab({ rows, indices: [0], variable: yVar, groupVariable: gVar, weighted: true, weights: [Number.NaN] })).toThrow(/非负有限数/);
        expect(() => calculateCrossTab({ rows, indices: [0, 0], variable: yVar, groupVariable: gVar, weighted: false })).toThrow(/重复/);
        expect(() => calculateCrossTab({ rows, indices: [5], variable: yVar, groupVariable: gVar, weighted: false })).toThrow(/样本索引无效/);
        expect(() => calculateCrossTab({ rows: [{ g: "Z", y: 10 }], indices: [0], variable: yVar, groupVariable: gVar, weighted: false })).toThrow(/字典外类别/);
        expect(() => calculateUnivariate({ population: rows, indices: [0], variable: idVar, weighted: false })).toThrow(/标识符/);
    });

    test("floating-point stability: Sterbenz large offset, signed cancellation, SRS SE guards and -0 normalization", () => {
        const gVar: VariableDefinition = {
            field: "g",
            label: "组",
            unit: "",
            kind: "nominal",
            categories: [{ value: "A", label: "A" }, { value: "B", label: "B" }],
            missing: [],
        };
        const yVar: VariableDefinition = {
            field: "y",
            label: "值",
            unit: "",
            kind: "continuous",
            categories: [],
            missing: [],
        };

        const base = 1e15;
        const offsetRows = [
            { g: "A", y: base + 1 },
            { g: "A", y: base + 5 },
            { g: "B", y: 1e200 },
            { g: "B", y: -1e200 },
            { g: "B", y: 3e-200 },
        ];
        const res = calculateCrossTab({
            rows: offsetRows,
            indices: [0, 1, 2, 3, 4],
            variable: yVar,
            groupVariable: gVar,
            weighted: true,
            weights: [1, 3, 1, 1, 1],
        });
        // Group A: base + (1*1 + 3*5)/4 = base + 4
        expect(res.groups[0]!.mean).toBe(base + 4);
        // Group B: (1e200 - 1e200 + 3e-200) / 3 = 1e-200
        expect(res.groups[1]!.mean! / 1e-200).toBeCloseTo(1, 14);

        // -0 normalization and SRS SE guard against negative/NaN variance
        expect(Object.is(scaledMean([-0, -0]), -0)).toBe(false);
        expect(computeSimpleRandomValueSe(-5, 10, 10)).toBeNull();
        expect(computeSimpleRandomValueSe(Number.NaN, 10, 5)).toBeNull();
    });

    test("property-based invariants: permutation invariance, weight-scale invariance and count conservation", () => {
        const rng = mulberry32(20261123);
        const gVar: VariableDefinition = {
            field: "g",
            label: "组",
            unit: "",
            kind: "nominal",
            categories: ["G1", "G2", "G3"].map((v) => ({ value: v, label: v })),
            missing: [null],
        };
        const yVar: VariableDefinition = {
            field: "y",
            label: "值",
            unit: "",
            kind: "continuous",
            categories: [],
            missing: [null],
        };

        for (let iter = 0; iter < 120; iter += 1) {
            const n = 4 + Math.floor(rng() * 16);
            const scale = 10 ** (Math.floor(rng() * 10) - 4);
            const rows = Array.from({ length: n }, () => ({
                g: rng() < 0.15 ? null : `G${1 + Math.floor(rng() * 3)}`,
                y: rng() < 0.15 ? null : Number(((rng() * 2 - 1) * scale).toFixed(5)),
            }));
            const indices = rows.map((_, i) => i);
            const weights = indices.map(() => 0.05 + rng() * 500);

            const base = calculateCrossTab({
                rows,
                indices,
                variable: yVar,
                groupVariable: gVar,
                weighted: true,
                weights,
            });
            expect(base.validCount + base.missingCount).toBe(n);
            expect(base.groups.reduce((acc, g) => acc + g.validCount, 0)).toBe(base.validCount);

            const perm = shuffle(indices, rng);
            const permuted = calculateCrossTab({
                rows,
                indices: perm,
                variable: yVar,
                groupVariable: gVar,
                weighted: true,
                weights: perm.map((idx) => weights[idx]!),
            });
            const factor = 0.01 + rng() * 1000;
            const rescaled = calculateCrossTab({
                rows,
                indices,
                variable: yVar,
                groupVariable: gVar,
                weighted: true,
                weights: weights.map((w) => w * factor),
            });

            for (let g = 0; g < 3; g += 1) {
                const expected = base.groups[g]!.mean;
                expect(permuted.groups[g]!.validCount).toBe(base.groups[g]!.validCount);
                if (expected == null) {
                    expect(permuted.groups[g]!.mean).toBeNull();
                    expect(rescaled.groups[g]!.mean).toBeNull();
                } else {
                    const tol = 1e-9 * Math.max(1, Math.abs(expected));
                    expect(Math.abs(permuted.groups[g]!.mean! - expected)).toBeLessThanOrEqual(tol);
                    expect(Math.abs(rescaled.groups[g]!.mean! - expected)).toBeLessThanOrEqual(tol);
                }
            }
            expect(JSON.stringify(base)).not.toMatch(/NaN|Infinity/);
        }
    });
});
