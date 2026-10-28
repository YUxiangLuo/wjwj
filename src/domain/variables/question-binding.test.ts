import { describe, expect, test } from "bun:test";
import { questionSignature, validateQuestionBindings } from "./question-binding";
import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import type { RawValue, VariableDictionary } from "./types";
import { createHappinessDictionary, happinessQuestionnaire } from "../../db/seeds/happiness-topic";

const dictionary: VariableDictionary = { source: "population.csv", revision: 2, variables: [
    { field: "sex", label: "性别", unit: "", kind: "nominal", categories: [{ value: 1, label: "男" }, { value: 2, label: "女" }], missing: [null] },
    { field: "age", label: "年龄", unit: "岁", kind: "continuous", categories: [], missing: [null] },
    { field: "rating", label: "评分", unit: "", kind: "ordinal", categories: [{ value: "low", label: "低" }, { value: "mid", label: "中" }, { value: "high", label: "高" }], missing: [] },
    { field: "student_id", label: "学号", unit: "", kind: "identifier", categories: [], missing: [] },
    { field: "uses_library", label: "使用图书馆", unit: "", kind: "nominal", categories: [{ value: 1, label: "是" }, { value: 0, label: "否" }], missing: [] },
    { field: "uses_lab", label: "使用实验室", unit: "", kind: "nominal", categories: [{ value: "Y", label: "是" }, { value: "N", label: "否" }], missing: [] },
    { field: "three_way", label: "三分类", unit: "", kind: "nominal", categories: [{ value: "a", label: "a" }, { value: "b", label: "b" }, { value: "c", label: "c" }], missing: [] },
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
    // 单值题关联必须保持完整双射。
    test("boolean and single mappings require a complete bijection with valid category values", () => {
        const q: Question = { id: "b", type: "boolean", content: "是否使用图书馆？" };
        const withAnswers = (answers: NonNullable<Question["variableBinding"]>["mappings"][number]["answers"]): NonNullable<Question["variableBinding"]> => ({
            taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q),
            mappings: [{ field: "uses_library", answers }],
        });
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: withAnswers([{ answer: "是", value: 1 }, { answer: "否", value: 0 }]) }), dictionary, 3)).not.toThrow();
        // 缺项 / 重复答案 / 多余答案均不得通过
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: withAnswers([{ answer: "是", value: 1 }]) }), dictionary, 3)).toThrow(/有效类别数量不一致/);
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: withAnswers([{ answer: "是", value: 1 }, { answer: "是", value: 0 }]) }), dictionary, 3)).toThrow(/答案映射不完整/);
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: withAnswers([{ answer: "是", value: 1 }, { answer: "否", value: 0 }, { answer: "不确定", value: 1 }]) }), dictionary, 3)).toThrow(/有效类别数量不一致/);
        // 映射值不在字段有效类别中（把答案文本当编码写入）
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: withAnswers([{ answer: "是", value: "是" }, { answer: "否", value: "否" }]) }), dictionary, 3)).toThrow(/一一对应/);
    });

    test("multiple choice requires one distinct binary field per option", () => {
        const q: Question = { id: "m", type: "multiple", content: "使用哪些设施？", options: ["图书馆", "实验室"], minSelect: 1, maxSelect: 2 };
        const make = (mappings: NonNullable<Question["variableBinding"]>["mappings"]): NonNullable<Question["variableBinding"]> => ({ taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q), mappings });
        const binary = (field: string, yes: RawValue, no: RawValue) => ({ field, answers: [{ answer: "是", value: yes }, { answer: "否", value: no }] });
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: make([
            { ...binary("uses_library", 1, 0), option: "图书馆" }, { ...binary("uses_lab", "Y", "N"), option: "实验室" },
        ]) }), dictionary, 3)).not.toThrow();
        // 复用同一列不能伪装成多个响应列
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: make([
            { ...binary("uses_library", 1, 0), option: "图书馆" }, { ...binary("uses_library", 1, 0), option: "实验室" },
        ]) }), dictionary, 3)).toThrow(/不能重复关联同一字段/);
        // 非二值列不能作为多选选项
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: make([
            { ...binary("uses_library", 1, 0), option: "图书馆" }, { ...binary("three_way", "a", "b"), option: "实验室" },
        ]) }), dictionary, 3)).toThrow(/有效类别数量不一致/);
        // 每个选项必须有独立映射
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: make([{ ...binary("uses_library", 1, 0), option: "图书馆" }]) }), dictionary, 3)).toThrow(/每个多选选项必须关联独立字段/);
    });

    // 逐项语义变更都使旧签名失效。
    test.each([
        ["题干", { content: "新的题干？" }],
        ["题型", { type: "multiple" as const, options: ["男", "女"] }],
        ["选项", { options: ["男", "女性"] }],
        ["选项顺序", { options: ["女", "男"] }],
    ] as Array<[string, Partial<Question>]>)("semantic edit invalidates the stored signature: %s", (_label, patch) => {
        const q: Question = { id: "q", type: "single", content: "性别", options: ["男", "女"] };
        q.variableBinding = { taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q), mappings: [{ field: "sex", answers: [{ answer: "男", value: 1 }, { answer: "女", value: 2 }] }] };
        const edited = { ...q, ...patch } as Question;
        expect(() => validateQuestionBindings(data(edited), dictionary, 3)).toThrow(/题意或规则已修改|重新确认/);
    });

    test.each([
        ["数值单位", { unit: "月" }],
        ["数值下限", { numericMin: 0 }],
        ["数值上限", { numericMax: 200 }],
        ["小数位数", { decimalPlaces: 2 }],
    ] as Array<[string, Partial<Question>]>)("numeric semantic edit invalidates the stored signature: %s", (_label, patch) => {
        const q: Question = { id: "n", type: "numeric", content: "年龄", unit: "岁", decimalPlaces: 0 };
        q.variableBinding = { taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q), mappings: [{ field: "age", answers: [] }] };
        expect(() => validateQuestionBindings(data({ ...q, ...patch }), dictionary, 3)).toThrow(/题意或规则已修改|重新确认/);
    });

    test("scale endpoint edits invalidate the signature", () => {
        const q: Question = { id: "s", type: "scale", content: "评分", scaleMin: 1, scaleMax: 3 };
        q.variableBinding = { taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q), mappings: [{ field: "rating", answers: [{ answer: "1", value: "low" }, { answer: "2", value: "mid" }, { answer: "3", value: "high" }] }] };
        expect(() => validateQuestionBindings(data({ ...q, scaleMax: 4 }), dictionary, 3)).toThrow(/重新确认/);
    });

    test("reordering questions preserves bindings while copying without a binding stays unbound", () => {
        const first: Question = { id: "q1", type: "single", content: "性别", options: ["男", "女"] };
        first.variableBinding = { taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(first), mappings: [{ field: "sex", answers: [{ answer: "男", value: 1 }, { answer: "女", value: 2 }] }] };
        const second: Question = { id: "q2", type: "boolean", content: "是否使用图书馆？" };
        second.variableBinding = { taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(second), mappings: [{ field: "uses_library", answers: [{ answer: "是", value: 1 }, { answer: "否", value: 0 }] }] };
        const reordered: QuestionnaireData = { title: "t", welcomeText: "w", endingText: "e", questions: [second, first] };
        expect(() => validateQuestionBindings(reordered, dictionary, 3)).not.toThrow();
        // 复制题目不继承关联：副本没有 variableBinding 时按未关联题目通过
        const copied: Question = { ...first, id: "q1-copy", variableBinding: undefined };
        expect(() => validateQuestionBindings({ title: "t", welcomeText: "w", endingText: "e", questions: [copied] }, dictionary, 3)).not.toThrow();
    });

    // 跨任务、来源和修订的关联均无效。
    test("cross-task, source and revision bindings are rejected", () => {
        const q: Question = { id: "q", type: "single", content: "性别", options: ["男", "女"] };
        const binding = (overrides: Record<string, unknown>) => ({ taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q), mappings: [{ field: "sex", answers: [{ answer: "男", value: 1 }, { answer: "女", value: 2 }] }], ...overrides });
        for (const overrides of [{ taskId: 4 }, { source: "other.csv" }, { revision: 1 }]) {
            expect(() => validateQuestionBindings(data({ ...q, variableBinding: binding(overrides) as Question["variableBinding"] }), dictionary, 3)).toThrow(/变量关联已过期/);
        }
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: binding({ mappings: [] }) as Question["variableBinding"] }), dictionary, 3)).toThrow(/不能为空/);
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: binding({ mappings: [{ field: "sex" }] }) as Question["variableBinding"] }), dictionary, 3)).toThrow(/格式无效/);
        expect(() => validateQuestionBindings(data({ ...q, variableBinding: binding({ signature: "forged" }) as Question["variableBinding"] }), dictionary, 3)).toThrow(/重新确认/);
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

describe("single-choice ordinal and explicit missing bindings", () => {
    const happiness = createHappinessDictionary("happiness-source");
    const serviceQuestion = happinessQuestionnaire.questions.find(question => question.id === "hq14")!;
    function bound(values: RawValue[] = [1, 2, 3, 4, 5, null], question = serviceQuestion): Question {
        return { ...question, variableBinding: { taskId: 1, source: happiness.source, revision: happiness.revision,
            signature: questionSignature(question), mappings: [{ field: "社区服务满意度",
                answers: values.map((value, index) => ({ answer: question.options![index]!, value })) }] } };
    }
    test("the actual service recommendation maps five ordered ratings and a nonuser answer to null", () => {
        expect(() => validateQuestionBindings(data(bound()), happiness, 1)).not.toThrow();
        const withoutMissing = { ...serviceQuestion, options: serviceQuestion.options!.slice(0, 5) };
        expect(() => validateQuestionBindings(data(bound([1, 2, 3, 4, 5], withoutMissing)), happiness, 1)).not.toThrow();
    });
    test("an explicitly mapped missing option may appear first instead of being guessed from position", () => {
        const reordered = { ...serviceQuestion, options: [serviceQuestion.options![5]!, ...serviceQuestion.options!.slice(0, 5)] };
        expect(() => validateQuestionBindings(data(bound([null, 1, 2, 3, 4, 5], reordered)), happiness, 1)).not.toThrow();
    });
    test.each([
        ["incomplete answer mapping", [1, 2, 3, 4, 5]],
        ["duplicate valid category", [1, 1, 3, 4, 5, null]],
        ["undeclared missing code", [1, 2, 3, 4, 5, 99]],
        ["text null instead of JSON null", [1, 2, 3, 4, 5, "null"]],
        ["missing answers replacing valid categories", [1, 2, 3, 4, null, null]],
    ] as Array<[string, RawValue[]]>)("rejects %s", (_label, values) => {
        expect(() => validateQuestionBindings(data(bound(values)), happiness, 1)).toThrow();
    });
    test("rejects duplicate answer labels and ordinal order changes", () => {
        const duplicate = bound();
        duplicate.variableBinding!.mappings[0]!.answers[5]!.answer = serviceQuestion.options![0]!;
        expect(() => validateQuestionBindings(data(duplicate), happiness, 1)).toThrow(/答案映射不完整/);
        expect(() => validateQuestionBindings(data(bound([5, 4, 3, 2, 1, null])), happiness, 1)).toThrow(/类别顺序递增/);
    });
    test("only declared missing codes are accepted, and at most one answer may be excluded", () => {
        const changed = structuredClone(happiness);
        changed.variables.find(variable => variable.field === "社区服务满意度")!.missing = [-99, null];
        expect(() => validateQuestionBindings(data(bound([1, 2, 3, 4, 5, -99])), changed, 1)).not.toThrow();
        const twoMissingOptions = { ...serviceQuestion, options: [...serviceQuestion.options!, "拒绝回答"] };
        expect(() => validateQuestionBindings(data(bound([1, 2, 3, 4, 5, null, -99], twoMissingOptions)), changed, 1)).toThrow(/最多关联一个缺失选项/);
        changed.variables.find(variable => variable.field === "社区服务满意度")!.missing = [];
        expect(() => validateQuestionBindings(data(bound()), changed, 1)).toThrow();
    });
    test("nominal choices retain arbitrary bijections and can explicitly exclude one declared missing answer", () => {
        const q: Question = { id: "q", type: "single", content: "性别", options: ["女", "男", "不愿回答"] };
        q.variableBinding = { taskId: 3, source: dictionary.source, revision: 2, signature: questionSignature(q),
            mappings: [{ field: "sex", answers: [{ answer: "女", value: 2 }, { answer: "男", value: 1 }, { answer: "不愿回答", value: null }] }] };
        expect(() => validateQuestionBindings(data(q), dictionary, 3)).not.toThrow();
    });
});
