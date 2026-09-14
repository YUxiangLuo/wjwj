import { parseNumericText } from "../../lib/numeric-text";
import type { RawValue, VariableDefinition, VariableDictionary } from "./types";

/** Confirmed categorical dictionaries are deliberately bounded; suggestions retain all values. */
export const MAX_CATEGORIES_PER_VARIABLE = 200;

export function valueKey(value: unknown): string {
    if (value === null) return "null:";
    if (typeof value === "string") return `string:${value}`;
    if (typeof value === "boolean") return `boolean:${value}`;
    if (typeof value === "number" && Number.isFinite(value)) return `number:${Object.is(value, -0) ? 0 : value}`;
    throw new Error("变量值必须是有限数字、文本、布尔值或 null");
}

function raw(value: unknown): RawValue {
    valueKey(value);
    return value as RawValue;
}

export function suggestDictionary(rows: Record<string, unknown>[], source: string, revision: number): VariableDictionary {
    if (!source.trim() || !Number.isSafeInteger(revision) || revision < 0) throw new Error("数据来源和修订号无效");
    const fields: string[] = [];
    const seenFields = new Set<string>();
    for (const row of rows) for (const field of Object.keys(row)) if (!seenFields.has(field)) {
        seenFields.add(field); fields.push(field);
    }
    const variables = fields.map((field): VariableDefinition => {
        const values = new Map<string, RawValue>();
        const blankValues = new Map<string, RawValue>();
        for (const row of rows) {
            if (!Object.prototype.hasOwnProperty.call(row, field)) throw new Error(`字段“${field}”在部分数据行中缺失`);
            const value = raw(row[field]);
            // CSV 的空单元是 ""、XLSX 是 null；纯空白文本按缺失处理，否则会生成
            // 空标签类别，并被 validateDictionary 以“无效类别标签”拒绝。
            if (value === null || (typeof value === "string" && value.trim() === "")) {
                if (value !== null) blankValues.set(valueKey(value), value);
                continue;
            }
            values.set(valueKey(value), value);
        }
        const kind = values.size > MAX_CATEGORIES_PER_VARIABLE ? "identifier" : "nominal";
        return {
            field, label: field, unit: "", kind,
            categories: kind === "nominal" ? [...values.values()].map(value => ({ value, label: String(value) })) : [],
            missing: [...blankValues.values(), null],
        };
    });
    return { source, revision, variables };
}

function exactObject(value: unknown, keys: string[], context: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${context}格式无效`);
    const actual = Object.keys(value).sort();
    if (actual.length !== keys.length || actual.some((key, i) => key !== [...keys].sort()[i])) throw new Error(`${context}字段不完整或含未知字段`);
    return value as Record<string, unknown>;
}

export function validateDictionary(value: unknown, rows: Record<string, unknown>[], source: string): VariableDictionary {
    const root = exactObject(value, ["source", "revision", "variables"], "变量字典");
    if (typeof root.source !== "string" || root.source !== source || !root.source.trim()) throw new Error("变量字典的数据来源不匹配");
    if (!Number.isSafeInteger(root.revision) || (root.revision as number) < 0) throw new Error("变量字典修订号无效");
    if (!Array.isArray(root.variables)) throw new Error("变量列表无效");
    const rowFields = new Set<string>();
    for (const row of rows) for (const field of Object.keys(row)) rowFields.add(field);
    if (root.variables.length !== rowFields.size) throw new Error("变量字典必须完整覆盖总体字段");
    const fields = new Set<string>();
    const variables = root.variables.map((item): VariableDefinition => {
        const object = exactObject(item, ["field", "label", "unit", "kind", "categories", "missing"], "变量定义");
        if (typeof object.field !== "string" || !rowFields.has(object.field) || fields.has(object.field)) throw new Error("变量字段缺失、重复或不存在");
        fields.add(object.field);
        if (typeof object.label !== "string" || !object.label.trim() || object.label.length > 120 || typeof object.unit !== "string" || object.unit.length > 60) throw new Error(`字段“${object.field}”的标签或单位无效`);
        if (object.kind !== "continuous" && object.kind !== "nominal" && object.kind !== "ordinal" && object.kind !== "identifier") throw new Error(`字段“${object.field}”的测量类型无效`);
        if (!Array.isArray(object.categories) || !Array.isArray(object.missing)) throw new Error(`字段“${object.field}”的分类或缺失编码无效`);
        const missing = object.missing.map(raw), missingKeys = new Set(missing.map(valueKey));
        if (missingKeys.size !== missing.length) throw new Error(`字段“${object.field}”含重复缺失编码`);
        const categories = object.categories.map(entry => {
            const category = exactObject(entry, ["value", "label"], "类别定义");
            const categoryValue = raw(category.value);
            if (typeof category.label !== "string" || !category.label.trim() || category.label.length > 120) throw new Error(`字段“${object.field}”含无效类别标签`);
            return { value: categoryValue, label: category.label };
        });
        const categoryKeys = new Set(categories.map(category => valueKey(category.value)));
        if (categoryKeys.size !== categories.length || [...categoryKeys].some(key => missingKeys.has(key))) throw new Error(`字段“${object.field}”的类别与缺失编码重复或冲突`);
        if ((object.kind === "continuous" || object.kind === "identifier") && categories.length) throw new Error(`非分类变量“${object.field}”不能定义类别`);
        if (object.kind !== "continuous" && categories.length > MAX_CATEGORIES_PER_VARIABLE) throw new Error(`字段“${object.field}”类别超过 ${MAX_CATEGORIES_PER_VARIABLE} 个限制`);
        const observed = new Set<string>();
        for (const row of rows) {
            if (!Object.prototype.hasOwnProperty.call(row, object.field)) throw new Error(`字段“${object.field}”在部分数据行中缺失`);
            const cell = raw(row[object.field]);
            const key = valueKey(cell);
            if (missingKeys.has(key)) continue;
            if (object.kind === "continuous") interpretNumeric(cell, { ...object, categories, missing } as VariableDefinition);
            else if (object.kind !== "identifier") observed.add(key);
        }
        if (object.kind !== "continuous" && [...observed].some(key => !categoryKeys.has(key))) throw new Error(`字段“${object.field}”的类别未覆盖完整总体`);
        return { field: object.field, label: object.label, unit: object.unit, kind: object.kind, categories, missing } as VariableDefinition;
    });
    return { source: root.source, revision: root.revision as number, variables };
}

export function interpretNumeric(value: unknown, variable: VariableDefinition): number | null {
    const key = valueKey(value);
    if (variable.missing.some(missing => valueKey(missing) === key)) return null;
    const numeric = parseNumericText(value);
    if (numeric === null) throw new Error(`字段“${variable.field}”含无法解释的数值`);
    return numeric;
}
