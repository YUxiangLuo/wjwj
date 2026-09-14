import { describe, expect, test } from "bun:test";
import {
    parseRecommendQuestionFromPayload,
    parseRecommendQuestionsPayload,
    validateQuestionAtIndex,
    validateRecommendQuestionsPayload,
} from "./validate-question";

describe("validateQuestionAtIndex", () => {
    test("accepts valid boolean", () => {
        expect(validateQuestionAtIndex({ type: "boolean", content: "是否满意？" }, 1)).toBeNull();
    });

    test("accepts valid single with options", () => {
        expect(
            validateQuestionAtIndex({ type: "single", content: "选一项", options: ["A", "B"] }, 1)
        ).toBeNull();
    });

    test("accepts valid multiple with min/max", () => {
        expect(
            validateQuestionAtIndex({
                type: "multiple",
                content: "多选",
                options: ["a", "b", "c"],
                minSelect: 1,
                maxSelect: 2,
            }, 1)
        ).toBeNull();
    });

    test("accepts valid scale", () => {
        expect(
            validateQuestionAtIndex({ type: "scale", content: "打分", scaleMin: 1, scaleMax: 5 }, 1)
        ).toBeNull();
    });

    test("normalizes numeric bounds without treating empty bounds as zero", () => {
        const result = parseRecommendQuestionFromPayload({ type: "numeric", content: "身高", unit: "cm", numericMin: "", numericMax: 250, decimalPlaces: 1 }, 1);
        expect(result).toMatchObject({ type: "numeric", unit: "cm", numericMax: 250, decimalPlaces: 1 });
        expect(result).not.toHaveProperty("numericMin");
        expect(validateQuestionAtIndex({ type: "numeric", content: "身高", decimalPlaces: 1, numericMin: 2, numericMax: 1 }, 1)).toMatch(/数值范围/);
    });

    // 布尔、数组、对象和 null 不得经 Number() 强转成 0/1。
    test.each([
        ["下限布尔 true", { numericMin: true, numericMax: 5 }],
        ["上限布尔 false", { numericMin: 0, numericMax: false }],
        ["下限空数组", { numericMin: [], numericMax: 5 }],
        ["上限单元素数组", { numericMin: 0, numericMax: [5] }],
        ["下限 null", { numericMin: null, numericMax: 5 }],
        ["上限 null", { numericMin: 0, numericMax: null }],
        ["下限对象", { numericMin: {}, numericMax: 5 }],
        ["上限对象", { numericMin: 0, numericMax: { valueOf: () => 5 } }],
        ["小数位布尔", { decimalPlaces: true }],
        ["小数位数组", { decimalPlaces: [1] }],
        ["小数位 null", { decimalPlaces: null }],
        ["小数位缺失", { decimalPlaces: undefined }],
        ["小数位 11", { decimalPlaces: 11 }],
        ["小数位 −1", { decimalPlaces: -1 }],
        ["小数位 1.5", { decimalPlaces: 1.5 }],
        ["量程布尔", { type: "scale", scaleMin: true, scaleMax: 5 }],
        ["量程数组", { type: "scale", scaleMin: 1, scaleMax: [5] }],
        ["多选下限布尔", { type: "multiple", options: ["甲", "乙"], minSelect: true, maxSelect: 2 }],
        ["多选上限 null", { type: "multiple", options: ["甲", "乙"], minSelect: 1, maxSelect: null }],
    ] as Array<[string, Record<string, unknown>]>)("rejects malformed numeric config: %s", (_label, overrides) => {
        const payload = { type: "numeric" as const, content: "试填", unit: "", decimalPlaces: 1, ...overrides };
        expect(typeof parseRecommendQuestionFromPayload(payload as Record<string, unknown>, 1)).toBe("string");
    });

    test("accepts lexical numeric strings but keeps scientific notation explicit", () => {
        const lexical = parseRecommendQuestionFromPayload({ type: "numeric", content: "试填", decimalPlaces: "1", numericMin: "-1.5", numericMax: "2.5" }, 1);
        expect(lexical).toMatchObject({ numericMin: -1.5, numericMax: 2.5, decimalPlaces: 1 });
        // 科学计数法是合法数值文本，必须解析为同一数值而非静默改写
        const scientific = parseRecommendQuestionFromPayload({ type: "numeric", content: "试填", decimalPlaces: "1", numericMin: "1e-3" }, 1);
        expect(scientific).toMatchObject({ numericMin: 0.001 });
        expect(validateQuestionAtIndex({ type: "numeric", content: "试填", decimalPlaces: 1, numericMin: "  " }, 1)).toMatch(/数值下限无效/);
    });

    test("rejects empty content", () => {
        expect(validateQuestionAtIndex({ type: "boolean", content: "   " }, 3)).toMatch(/第3题/);
    });

    test("rejects invalid type", () => {
        expect(validateQuestionAtIndex({ type: "text", content: "x" }, 1)).toMatch(/题型无效/);
    });

    test("rejects single with one option", () => {
        expect(validateQuestionAtIndex({ type: "single", content: "?", options: ["only"] }, 1)).toMatch(/选项数量/);
    });

    test("rejects scale with invalid range", () => {
        expect(validateQuestionAtIndex({ type: "scale", content: "?", scaleMin: 2, scaleMax: 2 }, 1)).toMatch(/量表范围/);
    });
});

describe("parseRecommendQuestionFromPayload", () => {
    test("preserves recommendSourceId for student questionnaire round-trip", () => {
        const r = parseRecommendQuestionFromPayload(
            {
                type: "boolean",
                content: "是否？",
                recommendSourceId: "teacher_rq_42",
            },
            1,
        );
        expect(typeof r).not.toBe("string");
        if (typeof r === "string") return;
        expect(r.recommendSourceId).toBe("teacher_rq_42");
    });

    test("preserves valid questionnaire sections and rejects unknown sections", () => {
        expect(parseRecommendQuestionFromPayload({ id: "q", type: "boolean", content: "是否符合？", section: "screening" }, 1)).toMatchObject({ section: "screening" });
        expect(validateQuestionAtIndex({ id: "q", type: "boolean", content: "是否符合？", section: "other" }, 1)).toBe("第1题所属部分无效");
    });
});

describe("validateRecommendQuestionsPayload", () => {
    test("rejects non-array", () => {
        expect(validateRecommendQuestionsPayload({})).toBe("题目列表格式无效");
    });

    test("rejects more than 30 items", () => {
        const items = Array.from({ length: 31 }, (_, i) => ({
            type: "boolean" as const,
            content: `q${i}`,
        }));
        expect(validateRecommendQuestionsPayload(items)).toBe("推荐题目数量不能超过30");
    });

    test("accepts empty list", () => {
        expect(validateRecommendQuestionsPayload([])).toBeNull();
    });
});

describe("parseRecommendQuestionsPayload", () => {
    test("returns normalized Question[] with generated ids when missing", () => {
        const r = parseRecommendQuestionsPayload([
            { type: "boolean", content: "是否？" },
            { type: "single", content: "选一", options: ["A", "B"] },
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.questions).toHaveLength(2);
        expect(r.questions[0]!.id).toMatch(/^q_/);
        expect(r.questions[0]!.type).toBe("boolean");
        expect(r.questions[1]!.options).toEqual(["A", "B"]);
    });

    test("preserves explicit id and multiple bounds", () => {
        const r = parseRecommendQuestionsPayload([
            {
                id: "rq_1",
                type: "multiple",
                content: "多选",
                options: ["a", "b", "c"],
                minSelect: 1,
                maxSelect: 2,
            },
        ]);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.questions[0]).toMatchObject({
            id: "rq_1",
            minSelect: 1,
            maxSelect: 2,
        });
    });
});
