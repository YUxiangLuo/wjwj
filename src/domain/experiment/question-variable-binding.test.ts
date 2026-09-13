import { expect, spyOn, test } from "bun:test";
import { bindingDictionary, bindingFor, bindingQuestion, boundQuestionnaire } from "@/test-utils/question-variable-binding";
import { hasQuestionVariableBindings, keepUnchangedQuestionBinding, parseQuestionVariableBinding, questionAnswers, questionBindingSignature, validateQuestionnaireBindings, withOptionIdentities } from "./question-variable-binding";
import type { Question } from "@/lib/questionnaire-types";
import { parseRecommendQuestionFromPayload } from "@/lib/validate-question";
import { normalizeRecommendQuestionsFromDb } from "@/lib/questionnaire-normalize";

test("typed categorical bindings roundtrip and strip untrusted extras", () => {
    const binding = bindingFor(); const before = structuredClone(binding);
    const result = parseQuestionVariableBinding({ ...binding, fakeResponses: [1, 2] }, bindingQuestion(), bindingDictionary(), 3);
    expect(result).toEqual({ ok: true, value: binding }); expect(binding).toEqual(before);
    expect(result.ok && result.value.answers.map(a => a.value)).toEqual(["01", 1]);
});
for (const [name, patch] of Object.entries({ future: { schemaVersion: 2 }, foreignTask: { taskId: 4 }, stale: { dictionaryRevision: 2 }, source: { datasetRevision: "b".repeat(64) }, signature: { questionSignature: "old meaning" }, fakeMultiple: { kind: "multiple-binary" } })) {
    test(`binding rejects ${name}`, () => expect(parseQuestionVariableBinding({ ...bindingFor(), ...patch }, bindingQuestion(), bindingDictionary(), 3).ok).toBe(false));
}
test("unconfirmed or absent dictionaries cannot confer a data link", () => {
    expect(parseQuestionVariableBinding(bindingFor(), bindingQuestion(), null).ok).toBe(false);
    expect(parseQuestionVariableBinding(bindingFor(), bindingQuestion(), { ...bindingDictionary(), revision: 0 }).ok).toBe(false);
});
for (const value of ["1", "N/A", "不存在", null, {}, 0]) {
    test(`binding rejects nonexistent, missing or differently typed code ${JSON.stringify(value)}`, () => {
        const binding = bindingFor(); (binding.answers[1] as any).value = value;
        expect(parseQuestionVariableBinding(binding, bindingQuestion(), bindingDictionary()).ok).toBe(false);
    });
}
test("single-valued bindings cannot duplicate, omit, reorder identities or cross variables", () => {
    for (const edit of [(b: ReturnType<typeof bindingFor>) => { b.answers[1]!.value = "01"; }, (b: ReturnType<typeof bindingFor>) => { b.answers.pop(); }, (b: ReturnType<typeof bindingFor>) => { b.answers.reverse(); }, (b: ReturnType<typeof bindingFor>) => { b.answers[1]!.variableId = "v_3"; b.answers[1]!.value = true; }]) {
        const binding = bindingFor(); edit(binding); expect(parseQuestionVariableBinding(binding, bindingQuestion(), bindingDictionary()).ok).toBe(false);
    }
});
test("boolean and ordered scale questions map their actual answer identities, not labels or array guesses", () => {
    const boolean: Question = { id: "yesno", type: "boolean", content: "是否参与" };
    expect(questionAnswers(boolean).map(a => a.id)).toEqual(["yes", "no"]);
    expect(parseQuestionVariableBinding(bindingFor(boolean, bindingDictionary(), "v_3"), boolean, bindingDictionary()).ok).toBe(true);
    const scale: Question = { id: "score", type: "scale", content: "评分", scaleMin: 1, scaleMax: 2 };
    const binding = bindingFor(scale, bindingDictionary(), "v_4");
    expect(parseQuestionVariableBinding(binding, scale, bindingDictionary()).ok).toBe(true);
    [binding.answers[0]!.value, binding.answers[1]!.value] = [2, 1];
    expect(parseQuestionVariableBinding(binding, scale, bindingDictionary()).ok).toBe(false);
    const continuous = bindingDictionary(); continuous.variables[3]!.measurementLevel = "continuous"; continuous.variables[3]!.categories = [];
    expect(parseQuestionVariableBinding(binding, scale, continuous).ok).toBe(false);
});
test("multiple response requires separate actual binary columns and explicit selected codes", () => {
    const question: Question = { ...bindingQuestion(), type: "multiple", minSelect: 1, maxSelect: 2 };
    const binding = bindingFor(question);
    expect(parseQuestionVariableBinding(binding, question, bindingDictionary()).ok).toBe(false);
    binding.answers[1] = { ...binding.answers[1]!, variableId: "v_3", value: false };
    expect(parseQuestionVariableBinding(binding, question, bindingDictionary()).ok).toBe(true);
    const dictionary = bindingDictionary(); dictionary.variables[2]!.categories.push({ value: "third", label: "第三类" });
    expect(parseQuestionVariableBinding(binding, question, dictionary).ok).toBe(false);
});
test("option identities work on ordinary HTTP without secure-context randomUUID", () => {
    const unavailable = spyOn(crypto, "randomUUID").mockImplementation(() => { throw new Error("unavailable on HTTP"); });
    try {
        const question = bindingQuestion(); delete question.optionIds;
        const adapted = withOptionIdentities(question);
        expect(new Set(adapted.optionIds).size).toBe(2);
        expect(adapted.optionIds![0]).toMatch(/^o_[a-f0-9]{32}$/);
    } finally { unavailable.mockRestore(); }
});

test("legacy adaptation is explicit, immutable and gives equal-label options distinct identities", () => {
    const old: Question = { id: "old", type: "single", content: "历史题", options: ["重复", "重复"] };
    const adapted = withOptionIdentities(old);
    expect(old.optionIds).toBeUndefined(); expect(new Set(adapted.optionIds).size).toBe(2);
    expect(withOptionIdentities(adapted)).toBe(adapted); expect(adapted.options).toEqual(old.options);
});
test("meaning edits/copies clear bindings while unchanged saves and questionnaire reorder preserve them", () => {
    const question = { ...bindingQuestion(), variableBinding: bindingFor() };
    expect(keepUnchangedQuestionBinding(question, { ...question }).variableBinding).toEqual(question.variableBinding);
    for (const patch of [{ content: "新含义" }, { id: "copied" }, { options: ["乙类", "甲类"], optionIds: ["o_b", "o_a"] }]) expect(keepUnchangedQuestionBinding(question, { ...question, ...patch }).variableBinding).toBeUndefined();
    const form = boundQuestionnaire(); form.questions.reverse();
    expect(validateQuestionnaireBindings(form, bindingDictionary(), 3)).toBeNull();
});
test("legacy unbound duplicate labels remain outside new association requirements; bound question IDs must be unique", () => {
    const legacy = { questions: [{ id: "same" }, { id: "same" }] };
    expect(hasQuestionVariableBindings(legacy)).toBe(false); expect(validateQuestionnaireBindings(legacy, null)).toBeNull();
    const form = boundQuestionnaire(); form.questions[1]!.id = form.questions[0]!.id;
    expect(validateQuestionnaireBindings(form, bindingDictionary(), 3)).toContain("身份");
});
test("declared malformed option identities are rejected rather than guessed", () => {
    for (const optionIds of [["same", "same"], ["one"], ["", "two"], [" ", "two"]]) {
        const question = { ...bindingQuestion(), optionIds };
        expect(typeof parseRecommendQuestionFromPayload(question, 1)).toBe("string");
    }
    const question = bindingQuestion();
    expect(parseRecommendQuestionFromPayload(question, 1)).toMatchObject({ optionIds: question.optionIds });
    expect(normalizeRecommendQuestionsFromDb([question])[0]!.optionIds).toEqual(question.optionIds);
});
test("bindings to incomplete ordinal score ranges cannot be inferred", () => {
    expect(questionAnswers({ id: "q", type: "scale", content: "评分", scaleMin: 1.5, scaleMax: 4 })).toEqual([]);
    expect(questionBindingSignature(bindingQuestion())).not.toBe(questionBindingSignature({ ...bindingQuestion(), options: ["甲类;乙类"] }));
});
