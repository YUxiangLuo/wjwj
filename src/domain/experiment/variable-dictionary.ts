/** Metadata only: never a source of questionnaire responses or sampling weights. */
export type VariableValue = string | number | boolean;
export type MeasurementLevel = "id" | "nominal" | "ordinal" | "continuous" | "unclassified";
export interface VariableDefinition {
    /** Scoped to the owning topic AND datasetRevision, not a global field identity. */
    id: string;
    sourceField: string;
    label: string;
    storageType: "text" | "number";
    measurementLevel: MeasurementLevel;
    unit: string;
    missingValues: VariableValue[];
    /** Array order is the declared order for ordinal variables. */
    categories: Array<{ value: VariableValue; label: string }>;
}
export interface VariableDictionaryV1 {
    schemaVersion: 1;
    /** Monotone per topic, including invalidations. A suggestion can have revision > 0;
     * confirmation is conveyed separately by the API, never inferred from this number. */
    revision: number;
    datasetRevision: string;
    parserVersion: "spreadsheet-v2";
    variables: VariableDefinition[];
}
export const MAX_VARIABLE_DICTIONARY_BYTES = 192 * 1024;
export const MAX_VARIABLE_CATEGORIES = 50;
const levels = new Set<MeasurementLevel>(["id", "nominal", "ordinal", "continuous", "unclassified"]);

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number, allowBlank = false): value is string {
    return typeof value === "string" && value.length <= max && !value.includes("\0") && (allowBlank || value.trim().length > 0);
}
function code(value: unknown): value is VariableValue {
    return (typeof value === "string" && text(value, 200))
        || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean";
}
/** No trim, case folding, NFKC, or numeric coercion for category identity. */
export function variableValueKey(value: VariableValue): string {
    return JSON.stringify([typeof value, value]);
}
export function isVariableMissing(value: unknown, missingValues: readonly VariableValue[]): boolean {
    return value == null || (typeof value === "string" && value.trim() === "")
        || missingValues.some(missing => typeof missing === typeof value && missing === value);
}

export type DictionaryParseResult = { ok: true; value: VariableDictionaryV1 } | { ok: false; error: string };
const invalid = (error: string): DictionaryParseResult => ({ ok: false, error });

/** Strict boundary parser. Unknown versions fail closed; legacy absence is handled by callers. */
export function parseVariableDictionary(raw: unknown): DictionaryParseResult {
    if (!record(raw) || raw.schemaVersion !== 1 || raw.parserVersion !== "spreadsheet-v2") {
        return invalid("变量字典版本无效或暂不支持");
    }
    if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 || Number(raw.revision) > Number.MAX_SAFE_INTEGER
        || typeof raw.datasetRevision !== "string" || !/^[a-f0-9]{64}$/.test(raw.datasetRevision)) {
        return invalid("变量字典来源或修订版本无效");
    }
    if (!Array.isArray(raw.variables) || raw.variables.length < 2 || raw.variables.length > 50) {
        return invalid("变量字典需包含总体的全部 2–50 个字段");
    }
    const ids = new Set<string>();
    const fields = new Set<string>();
    const variables: VariableDefinition[] = [];
    for (const entry of raw.variables) {
        if (!record(entry) || typeof entry.id !== "string" || !/^v_[1-9]\d{0,2}$/.test(entry.id)
            || !text(entry.sourceField, 1000) || !text(entry.label, 200) || !text(entry.unit, 40, true)
            || (entry.storageType !== "text" && entry.storageType !== "number")
            || !levels.has(entry.measurementLevel as MeasurementLevel)) return invalid("变量名称、身份、单位或类型无效");
        if (ids.has(entry.id) || fields.has(entry.sourceField)) return invalid("变量身份或源字段重复");
        ids.add(entry.id);
        fields.add(entry.sourceField);
        const level = entry.measurementLevel as MeasurementLevel;
        if ((level === "continuous" && entry.storageType !== "number") || (level === "id" && entry.storageType !== "text")) {
            return invalid(`字段 ${entry.sourceField} 的存储类型与测量类型不兼容`);
        }
        if (!Array.isArray(entry.missingValues) || entry.missingValues.length > 20 || !entry.missingValues.every(code)) {
            return invalid(`字段 ${entry.sourceField} 的缺失编码无效`);
        }
        const missingKeys = new Set(entry.missingValues.map(variableValueKey));
        if (missingKeys.size !== entry.missingValues.length) return invalid(`字段 ${entry.sourceField} 的缺失编码重复`);
        if (!Array.isArray(entry.categories) || entry.categories.length > MAX_VARIABLE_CATEGORIES) return invalid("类别数量超过字典上限");
        const categories: VariableDefinition["categories"] = [];
        const categoryKeys = new Set<string>();
        for (const category of entry.categories) {
            if (!record(category) || !code(category.value) || !text(category.label, 200)) return invalid("类别编码或标签无效");
            const key = variableValueKey(category.value);
            if (categoryKeys.has(key) || missingKeys.has(key)) return invalid("类别编码重复或与缺失编码冲突");
            categoryKeys.add(key);
            categories.push({ value: category.value, label: category.label });
        }
        if ((level === "nominal" || level === "ordinal") ? categories.length === 0 : categories.length !== 0) {
            return invalid(`字段 ${entry.sourceField} 的类别表与测量类型不兼容`);
        }
        if (level === "id" && entry.missingValues.length) return invalid("标识符不能声明缺失编码");
        variables.push({
            id: entry.id, sourceField: entry.sourceField, label: entry.label, unit: entry.unit,
            storageType: entry.storageType, measurementLevel: level,
            missingValues: [...entry.missingValues], categories,
        });
    }
    const value: VariableDictionaryV1 = {
        schemaVersion: 1, parserVersion: "spreadsheet-v2", revision: raw.revision as number,
        datasetRevision: raw.datasetRevision, variables,
    };
    if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_VARIABLE_DICTIONARY_BYTES) return invalid("变量字典超过 192 KiB，请减少类别标签内容");
    return { ok: true, value };
}

/** Validate metadata against the entire real dataset, never only the 20-row preview. */
export function validateDictionaryPopulation(
    dictionary: VariableDictionaryV1,
    source: { columns: string[]; rows: Array<Record<string, unknown>>; identifier?: string },
): string | null {
    if (source.columns.length !== dictionary.variables.length) return "变量字典必须覆盖全部真实字段";
    for (const [index, field] of source.columns.entries()) {
        const variable = dictionary.variables[index];
        if (!variable || variable.id !== `v_${index + 1}` || variable.sourceField !== field) return "源字段或变量身份已改变，请重新加载字典";
        if ((variable.measurementLevel === "id") !== (field === source.identifier)) return "标识符必须与现有抽样字段配置一致";
        const categories = new Set(variable.categories.map(category => variableValueKey(category.value)));
        const seen = new Set<string>();
        let validCount = 0;
        for (const [rowIndex, row] of source.rows.entries()) {
            if (!Object.hasOwn(row, field)) return `字段 ${field} 在数据第${rowIndex + 1}行不存在`;
            const value = row[field];
            if (isVariableMissing(value, variable.missingValues)) continue;
            validCount++;
            if (variable.storageType === "number" && (typeof value !== "number" || !Number.isFinite(value))) {
                return `字段 ${field} 在数据第${rowIndex + 1}行不是有效数值，请声明缺失编码或调整类型`;
            }
            if (variable.categories.length) {
                if (!code(value) || !categories.has(variableValueKey(value))) return `字段 ${field} 在数据第${rowIndex + 1}行的原值未被类别表覆盖`;
                seen.add(variableValueKey(value));
            }
        }
        if (variable.measurementLevel !== "unclassified" && validCount === 0) return `字段 ${field} 没有可分析的有效值`;
        if (variable.categories.some(category => !seen.has(variableValueKey(category.value)))) return `字段 ${field} 的类别表包含总体中不存在的原值`;
    }
    return null;
}

/** Conservative suggestions: only existing declared numeric roles become numbers. */
export function suggestVariableDictionary(source: {
    columns: string[]; rows: Array<Record<string, unknown>>; datasetRevision: string;
    identifier?: string; numeric?: string[];
}): VariableDictionaryV1 {
    let bytes = 1000;
    const variables = source.columns.map((sourceField, index): VariableDefinition => {
        const identifier = sourceField === source.identifier;
        const numeric = !identifier && (source.numeric ?? []).includes(sourceField);
        const variable: VariableDefinition = {
            id: `v_${index + 1}`, sourceField, label: sourceField.slice(0, 200), unit: "",
            storageType: numeric ? "number" : "text",
            measurementLevel: identifier ? "id" : numeric ? "continuous" : "unclassified",
            missingValues: [], categories: [],
        };
        if (!identifier && !numeric) {
            const values = new Map<string, VariableValue>();
            let supported = true;
            for (const row of source.rows) {
                const value = row[sourceField];
                if (isVariableMissing(value, [])) continue;
                if (!code(value)) { supported = false; break; }
                values.set(variableValueKey(value), value);
                if (values.size > MAX_VARIABLE_CATEGORIES) { supported = false; break; }
            }
            if (supported && values.size > 0) {
                variable.measurementLevel = "nominal";
                variable.categories = [...values.values()].map(value => ({ value, label: String(value) }));
            }
        }
        if (bytes + new TextEncoder().encode(JSON.stringify(variable)).length > MAX_VARIABLE_DICTIONARY_BYTES - 2000) {
            variable.categories = [];
            if (variable.measurementLevel === "nominal") variable.measurementLevel = "unclassified";
        }
        bytes += new TextEncoder().encode(JSON.stringify(variable)).length;
        return variable;
    });
    return { schemaVersion: 1, revision: 0, parserVersion: "spreadsheet-v2", datasetRevision: source.datasetRevision, variables };
}
