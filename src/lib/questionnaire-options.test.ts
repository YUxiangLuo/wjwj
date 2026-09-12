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
            const question = { id: "q", type, content: "请选择", options, minSelect: 1, maxSelect: 2 };
            expect(validateQuestionAtIndex(question, 3)).toBe("第3题选项内容重复，请修改后重试");
            expect(parseRecommendQuestionsPayload([question])).toEqual({ ok: false, error: "第1题选项内容重复，请修改后重试" });
            expect(validateQuestionAtIndex(question, 3, { allowLegacyDuplicateOptions: true })).toBeNull();
        });
    }
}

for (const type of ["single", "multiple"]) {
    test(`${type}: mathematical superscripts and symbols retain their meaning in strict saves`, () => {
        const question = { type, content: "选择数量", options: ["10²", "102", "10₂", "ℝ", "R"] };
        expect(validateQuestionAtIndex(question, 1)).toBeNull();
        expect(parseRecommendQuestionsPayload([question]).ok).toBe(true);
    });
}

test("legacy duplicate allowance does not permit invalid option counts or selection limits", () => {
    expect(validateQuestionAtIndex({ type: "single", content: "题目", options: ["甲"] }, 1, { allowLegacyDuplicateOptions: true })).toContain("选项数量");
    expect(validateQuestionAtIndex({ type: "multiple", content: "题目", options: ["甲", "甲"], minSelect: 3, maxSelect: 3 }, 1, { allowLegacyDuplicateOptions: true })).toContain("多选数量限制");
});
