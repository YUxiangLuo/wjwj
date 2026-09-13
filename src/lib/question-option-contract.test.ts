import { expect, test } from "bun:test";
import { parseRecommendQuestionFromPayload, validateQuestionAtIndex } from "./validate-question";
import { questionnaireOptionFormatError, validateOptionStructure } from "./questionnaire-options";
import { instantiateQuestion } from "./instantiate-question";
import { validateQuestionnaireForSubmit } from "@/student/experiment/submit-validation";
import { readStoredRecommendQuestions } from "./questionnaire-storage";
import { bindingQuestion } from "@/test-utils/question-variable-binding";
import { questionAnswers, questionBindingSignature } from "@/domain/experiment/question-variable-binding";

for (const options of [["甲", "乙"], [null, { id: "b", label: "乙" }], [{ id: "a", label: "甲" }, "乙"], [{ label: "甲" }, { id: "b", label: "乙" }], [{ id: "a", label: "甲", answer: 1 }, { id: "b", label: "乙" }], [{ id: "a", label: "甲" }, { id: "a", label: "乙" }]]) {
    test(`one option representation rejects malformed entries without repair: ${JSON.stringify(options)}`, () => {
        const question = { ...bindingQuestion(), options };
        const before = structuredClone(question);
        expect(validateQuestionAtIndex(question, 1)).not.toBeNull();
        expect(questionnaireOptionFormatError({ questions: [question] })).not.toBeNull();
        expect(() => readStoredRecommendQuestions([question])).toThrow();
        expect(() => instantiateQuestion(question as ReturnType<typeof bindingQuestion>, "copy")).toThrow();
        expect(question).toEqual(before);
    });
}
test("parallel identities are rejected even when the object options are otherwise valid", () => {
    for (const type of ["boolean", "single", "multiple", "scale", "numeric"]) {
        expect(validateQuestionAtIndex({ ...bindingQuestion(), type, optionIds: ["a", "b"] }, 1)).toContain("不接受平行");
    }
});
test("option identities and exact labels survive current reads and semantic signatures retain their meaning", () => {
    const question = bindingQuestion(); question.options![0]!.label = " 甲类 ";
    const parsed = parseRecommendQuestionFromPayload(question, 1);
    expect(parsed).toEqual(question);
    expect(questionAnswers(question)).toEqual(question.options!);
    expect(questionBindingSignature(question)).toBe(JSON.stringify([question.id, question.type, question.content, "main", [" 甲类 ", "乙类"], ["o_a", "o_b"], null, null, null, null, null, null]));
    if (typeof parsed === "string") throw Error(parsed);
    parsed.options![0]!.label = "changed"; expect(question.options![0]!.label).toBe(" 甲类 ");
});
test("question and questionnaire payloads reject answer tables rather than quietly retaining them", () => {
    for (const type of ["boolean", "single", "multiple", "scale", "numeric"]) {
        const question = { id: "q", type, content: "题目", responses: [0, false] };
        expect(validateQuestionAtIndex(question, 1)).toContain("不接受作答数据");
        expect(questionnaireOptionFormatError({ questions: [question] })).toContain("不接受作答数据");
    }
    const questionnaire = { title: "问卷", questions: [], answersByIndex: { 0: "a" } };
    expect(validateQuestionnaireForSubmit(questionnaire)).toBe("问卷包含未知配置，不接受作答数据");
    expect(questionnaireOptionFormatError(questionnaire)).toBe("问卷包含未知配置，不接受作答数据");
});
test("non-choice questions cannot conceal unused option configuration", () => {
    for (const type of ["boolean", "scale", "numeric"]) expect(validateQuestionAtIndex({ ...bindingQuestion(), type }, 1)).toContain("只有单选/多选");
});
test("draft shape checks reject invalid representation but leave incomplete content for explicit editing", () => {
    for (const value of [null, undefined, {}, { questions: [] }]) expect(questionnaireOptionFormatError(value)).toBeNull();
    for (const value of ["{}", [], { questions: null }, { questions: [null] }, { questions: [{ type: "boolean", options: [] }] }]) expect(questionnaireOptionFormatError(value)).not.toBeNull();
    expect(validateOptionStructure([{ id: "a", label: "" }, { id: "b", label: "" }])).toBeNull();
    expect(validateQuestionAtIndex({ ...bindingQuestion(), options: [{ id: "a", label: "" }, { id: "b", label: "" }] }, 1)).toContain("非空文本");
});
