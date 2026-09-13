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
