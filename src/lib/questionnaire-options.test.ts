import { expect, test } from "bun:test";
import { getDuplicateOptionIndexes } from "./questionnaire-options";
import { parseRecommendQuestionsPayload, validateQuestionAtIndex } from "./validate-question";

for (const [options, expected] of [
    [["甲", "甲", "乙", "甲"], [1, 2, 4]],
    [[" Ａ ", "A", "其他"], [1, 2]],
    [["一  次", "一\t次"], [1, 2]],
    [["", " ", "甲", "乙"], []],
    [["X", "x", "不同意", "同意"], []],
    [["10²", "102", "10₂", "ℝ", "R"], []],
] as const) {
    test(`duplicate positions: ${JSON.stringify(options)}`, () => {
        expect(getDuplicateOptionIndexes(options)).toEqual([...expected]);
    });
}

for (const type of ["single", "multiple"]) {
    for (const options of [["甲", "甲"], ["甲", " 甲 "], ["Ａ", "A"]]) {
        test(`${type} rejects equivalent labels for new student and teacher saves`, () => {
            const question = { id: "q", type, content: "请选择", options: options.map((label, i) => ({ id: `o_${i}`, label })), minSelect: 1, maxSelect: 2 };
            expect(validateQuestionAtIndex(question, 3)).toBe("第3题选项内容重复，请修改后重试");
            expect(parseRecommendQuestionsPayload([question])).toEqual({ ok: false, error: "第1题选项内容重复，请修改后重试" });
        });
    }
}

for (const type of ["single", "multiple"]) {
    test(`${type}: mathematical superscripts and symbols retain their meaning in strict saves`, () => {
        const question = { type, content: "选择数量", options: [{ id: "o_1", label: "10²" }, { id: "o_2", label: "102" }, { id: "o_3", label: "10₂" }, { id: "o_4", label: "ℝ" }, { id: "o_5", label: "R" }] };
        expect(validateQuestionAtIndex(question, 1)).toBeNull();
        expect(parseRecommendQuestionsPayload([question]).ok).toBe(true);
    });
}

test("one strict rule checks counts and selection limits", () => {
    expect(validateQuestionAtIndex({ type: "single", content: "题目", options: [{ id: "o_1", label: "甲" }] }, 1)).toContain("选项数量");
    expect(validateQuestionAtIndex({ type: "multiple", content: "题目", options: [{ id: "o_1", label: "甲" }, { id: "o_2", label: "乙" }], minSelect: 3, maxSelect: 3 }, 1)).toContain("多选数量限制");
});
