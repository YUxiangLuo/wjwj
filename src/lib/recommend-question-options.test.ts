import { describe, expect, test } from "bun:test";
import { formatRecommendOptionsSummary, recommendQuestionToStudentQuestion } from "./recommend-question-options";

describe("recommend-question-options", () => {
    test("recommendQuestionToStudentQuestion maps scale", () => {
        const q = recommendQuestionToStudentQuestion({
            questionType: 4,
            content: "满意度",
            scaleMin: 1,
            scaleMax: 5,
            scaleMinLabel: "差",
            scaleMaxLabel: "好",
        });
        expect(q.type).toBe("scale");
        expect(q.scaleMin).toBe(1);
        expect(q.scaleMax).toBe(5);
        expect(q.scaleMinLabel).toBe("差");
        expect(q.scaleMaxLabel).toBe("好");
    });

    test("recommendQuestionToStudentQuestion maps multiple", () => {
        const q = recommendQuestionToStudentQuestion({
            questionType: 3,
            content: "多选",
            choiceOptions: ["a", "b", "c"],
            minSelect: 2,
            maxSelect: 3,
        });
        expect(q.type).toBe("multiple");
        expect(q.minSelect).toBe(2);
        expect(q.maxSelect).toBe(3);
        expect(q.options).toEqual(["a", "b", "c"]);
    });

    test("formatRecommendOptionsSummary", () => {
        expect(
            formatRecommendOptionsSummary({
                questionType: 4,
                content: "x",
                scaleMin: 1,
                scaleMax: 5,
                scaleMinLabel: "低",
                scaleMaxLabel: "高",
            })
        ).toContain("1–5");
    });
});
