import { expect, test } from "bun:test";
import { canAdvanceQuestionnaireStep } from "./QuestionnaireDesign";

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

test("questionnaire step 2 requires enough valid questions", () => {
    expect(canAdvanceQuestionnaireStep(2, { ...baseValidation, questionCount: false })).toBe(false);
    expect(canAdvanceQuestionnaireStep(2, { ...baseValidation, optionCount: false })).toBe(false);
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
