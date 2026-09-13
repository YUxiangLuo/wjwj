import type { Question, QuestionnaireData } from "../../lib/questionnaire-types";
import { valueKey } from "./dictionary";
import type { VariableDefinition, VariableDictionary } from "./types";

function signaturePayload(question: Question) {
    return {
        type: question.type,
        content: question.content.trim(),
        section: question.section ?? "main",
        options: question.type === "single" || question.type === "multiple" ? (question.options ?? []) : undefined,
        minSelect: question.type === "multiple" ? question.minSelect : undefined,
        maxSelect: question.type === "multiple" ? question.maxSelect : undefined,
        scaleMin: question.type === "scale" ? question.scaleMin : undefined,
        scaleMax: question.type === "scale" ? question.scaleMax : undefined,
        scaleMinLabel: question.type === "scale" ? question.scaleMinLabel ?? "" : undefined,
        scaleMaxLabel: question.type === "scale" ? question.scaleMaxLabel ?? "" : undefined,
        unit: question.type === "numeric" ? question.unit ?? "" : undefined,
        numericMin: question.type === "numeric" ? question.numericMin : undefined,
        numericMax: question.type === "numeric" ? question.numericMax : undefined,
        decimalPlaces: question.type === "numeric" ? question.decimalPlaces : undefined,
    };
}

/** Human-inspectable deterministic signature; deliberately excludes id, source and list position. */
export function questionSignature(question: Question): string {
    return JSON.stringify(signaturePayload(question));
}

function categories(variable: VariableDefinition) {
    const missing = new Set(variable.missing.map(valueKey));
    return variable.categories.filter(category => !missing.has(valueKey(category.value)));
}

function assertCategoryBijection(mapping: NonNullable<Question["variableBinding"]>["mappings"][number], expectedAnswers: string[], variable: VariableDefinition, label: string) {
    const valid = categories(variable);
    if (mapping.answers.length !== expectedAnswers.length || valid.length !== expectedAnswers.length) throw new Error(`${label}与字段“${variable.field}”的有效类别数量不一致`);
    if (new Set(mapping.answers.map(item => item.answer)).size !== expectedAnswers.length || expectedAnswers.some(answer => !mapping.answers.some(item => item.answer === answer))) throw new Error(`${label}的答案映射不完整`);
    const values = mapping.answers.map(item => valueKey(item.value));
    const validValues = new Set(valid.map(item => valueKey(item.value)));
    if (new Set(values).size !== values.length || values.some(value => !validValues.has(value))) throw new Error(`${label}必须与全部有效类别一一对应`);
}

export function validateQuestionBindings(questionnaire: QuestionnaireData, dictionary: VariableDictionary | null, taskId: number): void {
    questionnaire.questions.forEach((question, index) => {
        const binding = question.variableBinding;
        if (!binding) return;
        const label = `第${index + 1}题`;
        if (!dictionary) throw new Error(`${label}有关联变量，但当前任务没有变量字典`);
        if (binding.taskId !== taskId || binding.source !== dictionary.source || binding.revision !== dictionary.revision) throw new Error(`${label}的变量关联已过期，请重新确认`);
        if (binding.signature !== questionSignature(question)) throw new Error(`${label}题意或规则已修改，请重新确认变量关联`);
        if (!binding.mappings.length) throw new Error(`${label}的变量关联不能为空`);
        const fields = binding.mappings.map(mapping => mapping.field);
        if (new Set(fields).size !== fields.length) throw new Error(`${label}不能重复关联同一字段`);
        const resolve = (field: string) => {
            const variable = dictionary.variables.find(item => item.field === field);
            if (!variable) throw new Error(`${label}关联的字段“${field}”不存在`);
            return variable;
        };
        if (question.type === "numeric") {
            if (binding.mappings.length !== 1) throw new Error(`${label}数值题只能关联一个字段`);
            const mapping = binding.mappings[0]!, variable = resolve(mapping.field);
            if (variable.kind !== "continuous" || mapping.answers.length) throw new Error(`${label}数值题只能关联连续变量且不能配置答案映射`);
            if ((question.unit ?? "") !== variable.unit) throw new Error(`${label}与字段“${variable.field}”的单位不一致`);
        } else if (question.type === "multiple") {
            const options = question.options ?? [];
            if (binding.mappings.length !== options.length || new Set(binding.mappings.map(item => item.option)).size !== options.length) throw new Error(`${label}每个多选选项必须关联独立字段`);
            for (const option of options) {
                const mapping = binding.mappings.find(item => item.option === option);
                if (!mapping) throw new Error(`${label}选项“${option}”缺少变量关联`);
                const variable = resolve(mapping.field);
                if (variable.kind !== "nominal") throw new Error(`${label}多选项只能关联二值名义变量`);
                assertCategoryBijection(mapping, ["是", "否"], variable, `${label}选项“${option}”`);
            }
        } else {
            if (binding.mappings.length !== 1) throw new Error(`${label}只能关联一个字段`);
            const mapping = binding.mappings[0]!, variable = resolve(mapping.field);
            if (question.type === "scale") {
                if (variable.kind !== "ordinal") throw new Error(`${label}评分题只能关联有序变量`);
                const min = question.scaleMin ?? 1, max = question.scaleMax ?? 10;
                assertCategoryBijection(mapping, Array.from({ length: max - min + 1 }, (_, i) => String(min + i)), variable, label);
            } else {
                if (variable.kind !== "nominal") throw new Error(`${label}只能关联名义变量`);
                assertCategoryBijection(mapping, question.type === "boolean" ? ["是", "否"] : question.options ?? [], variable, label);
            }
        }
    });
}
