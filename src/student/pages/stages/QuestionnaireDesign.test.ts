import { expect, test } from "bun:test";
import { createTeaPricingDictionary, teaPricingQuestionnaire } from "@/db/seeds/happiness-topic";
import { autoBindQuestionnaireVariables } from "@/domain/fieldwork";
import { validateQuestionBindings } from "@/domain/variables/question-binding";
import { canAdvanceQuestionnaireStep, getPreviewCompletionState, smartBindQuestionnaireVariables } from "./QuestionnaireDesign";

const baseValidation = {
    title: true,
    welcomeText: true,
    endingText: true,
    questionCount: true,
    optionCount: true,
    previewCompleted: true,
};

test("questionnaire step 1 requires title and welcome text", () => {
    expect(canAdvanceQuestionnaireStep(1, { ...baseValidation, welcomeText: false })).toBe(false);
    expect(canAdvanceQuestionnaireStep(1, { ...baseValidation, title: false })).toBe(false);
    expect(canAdvanceQuestionnaireStep(1, baseValidation)).toBe(true);
});

test("questionnaire step 2 requires enough valid questions and primary target binding when present", () => {
    expect(canAdvanceQuestionnaireStep(2, { ...baseValidation, questionCount: false })).toBe(false);
    expect(canAdvanceQuestionnaireStep(2, { ...baseValidation, optionCount: false })).toBe(false);
    expect(canAdvanceQuestionnaireStep(2, { ...baseValidation, targetBindingPassed: false })).toBe(false);
    expect(canAdvanceQuestionnaireStep(2, { ...baseValidation, targetBindingPassed: true })).toBe(true);
    expect(canAdvanceQuestionnaireStep(2, baseValidation)).toBe(true);
});

test("questionnaire step 3 requires ending text", () => {
    expect(canAdvanceQuestionnaireStep(3, { ...baseValidation, endingText: false })).toBe(false);
    expect(canAdvanceQuestionnaireStep(3, baseValidation)).toBe(true);
});

test("questionnaire step 4 requires preview completion", () => {
    expect(canAdvanceQuestionnaireStep(4, { ...baseValidation, previewCompleted: false })).toBe(false);
    expect(canAdvanceQuestionnaireStep(4, baseValidation)).toBe(true);
});

test("questionnaire preview completion closes overlay and keeps content hash", () => {
    const state = getPreviewCompletionState("title|welcome|ending|questions");

    expect(state).toEqual({
        previewCompleted: true,
        previewContentHash: "title|welcome|ending|questions",
        previewOpen: false,
    });
});

test("smartBindQuestionnaireVariables binds recommended scale, numeric-unit, and missing-option questions cleanly", () => {
    const dictionary = createTeaPricingDictionary("tea-source", 1);
    const result = smartBindQuestionnaireVariables({
        questionnaire: structuredClone(teaPricingQuestionnaire),
        dictionary,
        taskId: 1,
        targetField: "最高支付意愿",
    });

    expect(result.newlyBoundCount).toBe(11);
    expect(() => validateQuestionBindings(result.questionnaire, dictionary, 1)).not.toThrow();

    const boundFields = result.questionnaire.questions.flatMap((q) =>
        (q.variableBinding?.mappings ?? []).map((m) => m.field),
    );
    expect(boundFields).toContain("最高支付意愿");
    expect(boundFields).toContain("健康低糖关注度");
    expect(boundFields).toContain("新品尝鲜意愿");
    expect(boundFields).toContain("价格敏感度");
    expect(boundFields).toContain("月均茶饮消费额");
    expect(boundFields).toContain("近一月领券核销次数");
    expect(boundFields).toContain("门店小程序体验评分");
    expect(boundFields).toContain("月均购茶频次档位");
    expect(boundFields).toContain("城市线级");
    expect(boundFields).toContain("消费场景偏好");

    const stage4Parity = autoBindQuestionnaireVariables({
        questionnaire: structuredClone(teaPricingQuestionnaire),
        dictionary,
        taskId: 1,
        targetField: "最高支付意愿",
    });
    expect(stage4Parity).toEqual(result);
});
