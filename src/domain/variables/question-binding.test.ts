import { describe, expect, test } from "bun:test";
import { questionSignature, validateQuestionBindings } from "./question-binding";
import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import type { VariableDictionary } from "./types";

const dictionary: VariableDictionary = { source: "population.csv", revision: 2, variables: [
    { field: "sex", label: "性别", unit: "", kind: "nominal", categories: [{ value: 1, label: "男" }, { value: 2, label: "女" }], missing: [null] },
    { field: "age", label: "年龄", unit: "岁", kind: "continuous", categories: [], missing: [null] },
    { field: "rating", label: "评分", unit: "", kind: "ordinal", categories: [{ value: "low", label: "低" }, { value: "mid", label: "中" }, { value: "high", label: "高" }], missing: [] },
    { field: "student_id", label: "学号", unit: "", kind: "identifier", categories: [], missing: [] },
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
    test("rejects malformed hostile JSON before dereferencing nested arrays", () => {
        const q: Question = { id: "q", type: "single", content: "性别", options: ["男", "女"] };
        const base = { taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q) };
        for (const variableBinding of [
            null,
            { ...base, mappings: null },
            { ...base, mappings: [null] },
            { ...base, mappings: [{ field: "sex", answers: null }] },
            { ...base, mappings: [{ field: "sex", answers: [{ answer: "男", value: {} }] }] },
        ]) expect(() => validateQuestionBindings(data({ ...q, variableBinding } as unknown as Question), dictionary, 3)).toThrow(/格式无效/);
    });
    test("scale mapping follows dictionary ordinal category order", () => {
        const q: Question = { id: "s", type: "scale", content: "评分", scaleMin: 1, scaleMax: 3 };
        const binding = (values: string[]) => ({ taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q), mappings: [{ field: "rating", answers: values.map((value, i) => ({ answer: String(i + 1), value })) }] });
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: binding(["low", "mid", "high"]) }), dictionary, 3)).not.toThrow();
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: binding(["high", "mid", "low"]) }), dictionary, 3)).toThrow(/类别顺序递增/);
    });
    test("rejects unsupported bindings and option metadata outside multiple questions", () => {
        const q: Question = { id: "q", type: "single", content: "性别", options: ["男", "女"] };
        const makeBinding = (field: string, option?: string) => ({ taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q), mappings: [{ field, ...(option === undefined ? {} : { option }), answers: [{ answer: "男", value: 1 }, { answer: "女", value: 2 }] }] });
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: makeBinding("sex", "男") }), dictionary, 3)).toThrow(/只有多选题/);
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: makeBinding("student_id") }), dictionary, 3)).toThrow(/标识符/);
        const text = { ...q, type: "text", variableBinding: makeBinding("sex") } as unknown as Question;
        expect(() => validateQuestionBindings(data(text), dictionary, 3)).toThrow(/题型不支持/);
    });
});
