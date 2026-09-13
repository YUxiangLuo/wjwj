import { decimalIdentity } from "@/lib/decimal-input";
import {
    parseVariableDictionary, type DictionaryParseResult, type VariableDefinition,
    type VariableDictionaryV1, type VariableValue,
} from "@/domain/experiment/variable-dictionary";

export interface CodeDraft { kind: "string" | "number" | "boolean"; text: string }
export interface VariableDraft extends Omit<VariableDefinition, "categories" | "missingValues"> {
    categories: Array<CodeDraft & { label: string }>;
    missingValues: CodeDraft[];
}
export function codeDraft(value: VariableValue): CodeDraft {
    return { kind: typeof value as CodeDraft["kind"], text: String(value) };
}
export function dictionaryDraft(dictionary: VariableDictionaryV1): VariableDraft[] {
    return dictionary.variables.map(variable => ({ ...variable,
        categories: variable.categories.map(c => ({ ...codeDraft(c.value), label: c.label })),
        missingValues: variable.missingValues.map(codeDraft),
    }));
}
export function readCodeDraft(draft: CodeDraft): VariableValue {
    if (draft.kind === "string") return draft.text; // Never trim or normalize an original code.
    if (draft.kind === "boolean" && (draft.text === "true" || draft.text === "false")) return draft.text === "true";
    if (draft.kind === "number" && /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(draft.text)) {
        const value = Number(draft.text);
        if (Number.isFinite(value)) {
            if (decimalIdentity(draft.text) !== decimalIdentity(String(value))) throw new Error("数值编码转换会改变有效数字，请核对原值或使用文本。");
            return value;
        }
    }
    throw new Error("原值格式无效：数值需为完整十进制数字（如 0.5）；带前导零的编码请使用文本。");
}
export function buildDictionaryDraft(base: VariableDictionaryV1, variables: VariableDraft[]): DictionaryParseResult {
    const values: VariableDefinition[] = [];
    for (const variable of variables) {
        try {
            values.push({ ...variable,
                categories: variable.measurementLevel === "nominal" || variable.measurementLevel === "ordinal"
                    ? variable.categories.map(c => ({ value: readCodeDraft(c), label: c.label })) : [],
                missingValues: variable.missingValues.map(readCodeDraft),
            });
        } catch (error) {
            return { ok: false, error: `字段 ${JSON.stringify(variable.sourceField)}：${error instanceof Error ? error.message : "编码无效"}` };
        }
    }
    return parseVariableDictionary({ ...base, variables: values });
}
export const measurementLabels = {
    id: "标识符", nominal: "无序分类", ordinal: "有序分类", continuous: "连续数值", unclassified: "未分类",
} as const;
