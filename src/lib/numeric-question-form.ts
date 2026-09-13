import { parseDecimalInput } from "./decimal-input";
import { parseNumericQuestionRule, type NumericQuestionRule } from "./numeric-question";
export interface NumericRuleDraft { unit: string; min: string; max: string; decimalPlaces: string }
export function numericRuleDraft(rule?: NumericQuestionRule): NumericRuleDraft {
    if (!rule) return { unit: "", min: "", max: "", decimalPlaces: "" };
    return { unit: rule.unit, min: rule.min === null ? "" : String(rule.min), max: rule.max === null ? "" : String(rule.max), decimalPlaces: rule.decimalPlaces === null ? "" : String(rule.decimalPlaces) };
}
export function buildNumericRule(draft: NumericRuleDraft): ReturnType<typeof parseNumericQuestionRule> {
    const bounds: { min: number | null; max: number | null } = { min: null, max: null };
    for (const key of ["min", "max"] as const) {
        if (draft[key] === "") continue;
        const parsed = parseDecimalInput(draft[key]);
        if (!parsed.ok) return { ok: false, error: `${key === "min" ? "下限" : "上限"}：${parsed.error}` };
        bounds[key] = parsed.value;
    }
    if (draft.decimalPlaces !== "" && !/^(?:[0-9]|1[0-2])$/.test(draft.decimalPlaces)) return { ok: false, error: "小数位需为 0–12 的整数" };
    return parseNumericQuestionRule({ ...bounds, unit: draft.unit, decimalPlaces: draft.decimalPlaces === "" ? null : Number(draft.decimalPlaces) });
}
