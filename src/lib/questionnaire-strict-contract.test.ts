import { expect, test } from "bun:test";
import { parseRecommendQuestionsPayload, validateQuestionAtIndex } from "./validate-question";
import { readStoredRecommendQuestions } from "./questionnaire-storage";
import { boundQuestionnaire } from "@/test-utils/question-variable-binding";
import { validateQuestionnaireForSubmit } from "@/student/experiment/submit-validation";
import { buildStageCompletionUpdates } from "@/student/experiment/update-service";

for (const value of ["2", null, 1.5, NaN, Infinity]) {
    test(`selection limits are not rounded, coerced or defaulted: ${String(value)}`, () => {
        expect(validateQuestionAtIndex({ id: "q", type: "multiple", content: "请选择", options: [{ id: "o_1", label: "甲" }, { id: "o_2", label: "乙" }], minSelect: value }, 1)).toContain("多选数量限制");
        expect(validateQuestionAtIndex({ id: "q", type: "scale", content: "评分", scaleMin: value, scaleMax: 5 }, 1)).toContain("量表范围");
    });
}
for (const options of [["甲", 1], ["甲", false], ["甲", {}], ["甲", " ", "乙"]]) {
    test(`invalid option entries are rejected rather than silently removed: ${JSON.stringify(options)}`, () => {
        expect(validateQuestionAtIndex({ id: "q", type: "single", content: "请选择", options: options.map((label, i) => ({ id: `o_${i}`, label })) }, 1)).toBe(options.every(label => typeof label === "string") ? "第1题选项需为非空文本" : "第1题选项必须为仅包含 id 和 label 的对象，不接受旧文本数组或额外配置");
    });
}
test("creation never accepts an identity that strict storage cannot read", () => {
    for (const id of [null, 7, "", " ", "x".repeat(201), "q\0broken"]) {
        expect(parseRecommendQuestionsPayload([{ id, type: "boolean", content: "是否" }]).ok).toBe(false);
    }
    for (const type of [" boolean ", null, 1]) expect(validateQuestionAtIndex({ id: "q", type, content: "是否" }, 1)).toContain("题型无效");
    const created = parseRecommendQuestionsPayload([{ id: " exact-id ", type: "boolean", content: "是否" }]);
    expect(created.ok).toBe(true);
    if (created.ok) { expect(created.questions[0]!.id).toBe(" exact-id "); expect(readStoredRecommendQuestions(created.questions)).toEqual(created.questions); }
});

test("duplicate question identities fail for recommendations and unbound stage work too", () => {
    const q = { id: "same", type: "boolean", content: "是否" };
    expect(parseRecommendQuestionsPayload([q, q])).toMatchObject({ ok: false, error: "推荐题目的身份不能重复" });
    const questionnaire = boundQuestionnaire(); delete questionnaire.questions[0]!.variableBinding;
    questionnaire.questions[1]!.id = questionnaire.questions[0]!.id;
    expect(validateQuestionnaireForSubmit(questionnaire)).toBe("题目身份无效或重复，请重新编辑问卷");
    const result = buildStageCompletionUpdates({ experimentRecord: { taskId: 3, version: 1, currentStage: 1, status: "in_progress" } as any,
        stage: 1, payload: { questionnaire }, populationSize: 100, deadlinePassed: false });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR", message: "题目身份无效或重复，请重新编辑问卷" });
});
