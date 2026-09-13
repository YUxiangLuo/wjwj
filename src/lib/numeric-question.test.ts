import { expect, test } from "bun:test";
import { parseNumericQuestionRule, readNumericAnswer } from "./numeric-question";
import { parseRecommendQuestionFromPayload } from "./validate-question";
import { readStoredRecommendQuestions } from "./questionnaire-storage";
import { buildNumericRule, numericRuleDraft } from "./numeric-question-form";
const rule = { unit: "分钟", min: -10, max: 100, decimalPlaces: 2 };
for (const [text, value] of [["0",0],["-2.5",-2.5],["1.2300",1.23],["1e2",100],["-10",-10],["1.2e-1",0.12]] as const) {
    test(`numeric trial accepts exact decimal meaning ${text}`, () => expect(readNumericAnswer(text, rule)).toEqual({ ok: true, value }));
}
for (const text of ["", " ", "001", ".5", "1.", "0x10", "NaN", "Infinity", "1,000", "１", "100.01", "-10.01", "0.001", "9007199254740993", "1e-400", "0.10000000000000001"]) {
    test(`numeric trial rejects without coercion: ${JSON.stringify(text)}`, () => expect(readNumericAnswer(text, rule).ok).toBe(false));
}
for (const raw of [null, {}, { ...rule, min: undefined }, { ...rule, max: "100" }, { ...rule, min: Infinity }, { ...rule, min: 100 }, { ...rule, decimalPlaces: 1.5 }, { ...rule, decimalPlaces: 13 }, { ...rule, decimalPlaces: "2" }, { ...rule, unit: " " }, { ...rule, min: 0.001 }, { ...rule, round: true }]) {
    test(`numeric configuration has no missing-field/default adapter: ${JSON.stringify(raw)}`, () => expect(parseNumericQuestionRule(raw).ok).toBe(false));
}
test("unbounded and integer-only rules are explicit, zero is never missing", () => {
    expect(readNumericAnswer("0", { unit: "", min: null, max: null, decimalPlaces: 0 }).ok).toBe(true);
    expect(readNumericAnswer("0.1", { unit: "", min: null, max: null, decimalPlaces: 0 }).ok).toBe(false);
    expect(readNumericAnswer("5e-324", { unit: "", min: null, max: null, decimalPlaces: null }).ok).toBe(true);
});
test("strict rule drafts retain blank bounds as null, not zero, and never round typed bounds", () => {
    expect(buildNumericRule(numericRuleDraft())).toEqual({ ok: true, value: { unit: "", min: null, max: null, decimalPlaces: null } });
    expect(buildNumericRule(numericRuleDraft(rule))).toEqual({ ok: true, value: rule });
    expect(buildNumericRule({ ...numericRuleDraft(rule), min: "0.10000000000000001" }).ok).toBe(false);
    expect(buildNumericRule({ ...numericRuleDraft(rule), decimalPlaces: "2.5" }).ok).toBe(false);
});
test("teacher writes and stored reads use the same quantitative question, never a score or option table", () => {
    const question = { id: "numeric", type: "numeric" as const, content: "等候时长？", numberRule: rule };
    expect(parseRecommendQuestionFromPayload(question, 1)).toEqual(question);
    expect(readStoredRecommendQuestions([question])).toEqual([question] as any);
    for (const patch of [{ numberRule: undefined }, { type: "scale" }, { options: [{ id: "o_1", label: "1" }, { id: "o_2", label: "2" }] }, { scaleMin: 1 }, { answer: 12 }]) expect(typeof parseRecommendQuestionFromPayload({ ...question, ...patch }, 1)).toBe("string");
});
