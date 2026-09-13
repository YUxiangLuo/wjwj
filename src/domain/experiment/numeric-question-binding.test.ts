import { expect, test } from "bun:test";
import type { Question } from "@/lib/questionnaire-types";
import { bindingDictionary, boundQuestionnaire } from "@/test-utils/question-variable-binding";
import { keepUnchangedQuestionBinding, parseQuestionVariableBinding, questionBindingSignature, type ContinuousQuestionBinding } from "./question-variable-binding";
import { buildStageCompletionUpdates } from "@/student/experiment/update-service";
const question: Question = { id: "amount", type: "numeric", content: "您的实际金额是多少？", numberRule: { unit: "元", min: 0, max: null, decimalPlaces: 2 } };
function fixture() {
    const dictionary = bindingDictionary(); dictionary.variables[4]!.unit = "元";
    const binding: ContinuousQuestionBinding = { schemaVersion: 1, kind: "continuous", taskId: 3, datasetRevision: dictionary.datasetRevision, dictionaryRevision: dictionary.revision, questionSignature: questionBindingSignature(question), variableId: "v_5" };
    return { dictionary, binding };
}
test("continuous binding carries a variable reference, not an invented answer or category coding", () => {
    const { dictionary, binding } = fixture();
    expect(parseQuestionVariableBinding({ ...binding, fakeResponses: [12] }, question, dictionary, 3)).toEqual({ ok: true, value: binding });
    expect(binding).not.toHaveProperty("answers");
});
for (const [name, patch] of Object.entries({ id: { variableId: "v_1" }, category: { variableId: "v_2" }, ordinal: { variableId: "v_4" }, answer: { answers: [] }, foreign: { taskId: 4 }, stale: { dictionaryRevision: 2 }, wrongKind: { kind: "categorical" } })) {
    test(`quantitative binding rejects ${name}`, () => {
        const { dictionary, binding } = fixture();
        expect(parseQuestionVariableBinding({ ...binding, ...patch }, question, dictionary, 3).ok).toBe(false);
    });
}
test("units must match exactly; no minute/second, alias, or whitespace conversions", () => {
    const { dictionary, binding } = fixture();
    for (const unit of ["万元", "元 ", ""]) { dictionary.variables[4]!.unit = unit; expect(parseQuestionVariableBinding(binding, question, dictionary).ok).toBe(false); }
});
test("changes to bounds, decimal rules, unit or text invalidate the semantic claim", () => {
    const { binding, dictionary } = fixture(); const previous = { ...question, variableBinding: binding };
    expect(keepUnchangedQuestionBinding(previous, { ...previous }).variableBinding).toEqual(binding);
    for (const patch of [{ unit: "万元" }, { min: 1 }, { max: 200 }, { decimalPlaces: 0 }]) {
        const next = { ...previous, numberRule: { ...question.numberRule!, ...patch } };
        expect(keepUnchangedQuestionBinding(previous, next).variableBinding).toBeUndefined();
        expect(parseQuestionVariableBinding(binding, next, dictionary).ok).toBe(false);
    }
});
test("normal stage completion persists the canonical numeric binding and rejects mismatched rules", () => {
    const { dictionary, binding } = fixture(); const questionnaire = boundQuestionnaire(); questionnaire.questions[0] = { ...question, variableBinding: binding };
    const input = { experimentRecord: { taskId: 3, version: 4, currentStage: 1, status: "in_progress" } as any, stage: 1, payload: { questionnaire }, populationSize: 100, deadlinePassed: false, variableDictionary: dictionary };
    const result = buildStageCompletionUpdates(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.updates.questionnaire).toEqual(questionnaire);
    questionnaire.questions[0]!.numberRule = { ...question.numberRule!, decimalPlaces: 0 };
    expect(buildStageCompletionUpdates(input)).toMatchObject({ ok: false, code: "INVALID_VARIABLE_BINDING" });
});
