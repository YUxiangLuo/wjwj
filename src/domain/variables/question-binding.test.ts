import { describe, expect, test } from "bun:test";
import { questionSignature, validateQuestionBindings } from "./question-binding";
import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import type { VariableDictionary } from "./types";

const dictionary: VariableDictionary = { source: "population.csv", revision: 2, variables: [
    { field: "sex", label: "性别", unit: "", kind: "nominal", categories: [{ value: 1, label: "男" }, { value: 2, label: "女" }], missing: [null] },
    { field: "age", label: "年龄", unit: "岁", kind: "continuous", categories: [], missing: [null] },
] };
const data = (question: Question): QuestionnaireData => ({ title: "t", welcomeText: "w", endingText: "e", questions: [question] });

describe("question variable binding", () => {
    test("signature ignores id and binding, but detects semantic edits", () => {
        const q: Question = { id: "a", type: "single", content: "性别", options: ["男", "女"] };
        expect(questionSignature({ ...q, id: "b" })).toBe(questionSignature(q));
        expect(questionSignature({ ...q, content: "生理性别" })).not.toBe(questionSignature(q));
    });
    test("accepts nominal bijection and rejects stale signature", () => {
        const q: Question = { id: "q", type: "single", content: "性别", options: ["男", "女"] };
        q.variableBinding = { taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q), mappings: [{ field: "sex", answers: [{ answer: "男", value: 1 }, { answer: "女", value: 2 }] }] };
        expect(() => validateQuestionBindings(data(q), dictionary, 3)).not.toThrow();
        expect(() => validateQuestionBindings(data({ ...q, content: "已修改" }), dictionary, 3)).toThrow(/重新确认/);
    });
    test("numeric requires continuous field with exact unit and no answers", () => {
        const q: Question = { id: "n", type: "numeric", content: "年龄", unit: "岁", decimalPlaces: 0 };
        q.variableBinding = { taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q), mappings: [{ field: "age", answers: [] }] };
        expect(() => validateQuestionBindings(data(q), dictionary, 3)).not.toThrow();
        expect(() => validateQuestionBindings(data({ ...q, unit: "年", variableBinding: { ...q.variableBinding!, signature: questionSignature({ ...q, unit: "年" }) } }), dictionary, 3)).toThrow(/单位不一致/);
    });
});
