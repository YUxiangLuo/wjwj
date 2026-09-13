import { decimalPlaces, parseDecimalInput } from "./decimal-input";

/** Trial input rules, not a data transformation or a filter over the teacher's population. */
export interface NumericQuestionRule {
    unit: string;
    min: number | null;
    max: number | null;
    decimalPlaces: number | null;
}
export function parseNumericQuestionRule(raw: unknown): { ok: true; value: NumericQuestionRule } | { ok: false; error: string } {
    const fail = (error: string) => ({ ok: false as const, error });
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fail("数值题必须明确配置单位、范围和小数位规则");
    const r = raw as Record<string, unknown>;
    if (Object.keys(r).some(key => !["unit", "min", "max", "decimalPlaces"].includes(key))) return fail("数值题规则包含未知配置");
    if (typeof r.unit !== "string" || r.unit.length > 40 || r.unit.includes("\0") || (r.unit !== "" && !r.unit.trim())) return fail("单位需为 0–40 字的文本，未声明时留空");
    if (![r.min, r.max].every(value => value === null || (typeof value === "number" && Number.isFinite(value)))) return fail("上下限需为有限数值，不限制时明确留空");
    if (r.min !== null && r.max !== null && (r.min as number) >= (r.max as number)) return fail("数值题下限必须小于上限");
    if (r.decimalPlaces !== null && (typeof r.decimalPlaces !== "number" || !Number.isInteger(r.decimalPlaces) || r.decimalPlaces < 0 || r.decimalPlaces > 12)) return fail("小数位需为 0–12 的整数，不限制时明确留空");
    if (r.decimalPlaces !== null && [r.min, r.max].some(value => value !== null && decimalPlaces(value as number) > (r.decimalPlaces as number))) return fail("上下限的小数位不能超过作答规则");
    return { ok: true, value: { unit: r.unit, min: r.min as number | null, max: r.max as number | null, decimalPlaces: r.decimalPlaces as number | null } };
}
export function readNumericAnswer(text: string, rawRule: unknown): { ok: true; value: number } | { ok: false; error: string } {
    const rule = parseNumericQuestionRule(rawRule);
    if (!rule.ok) return rule;
    const result = parseDecimalInput(text);
    if (!result.ok) return result;
    const { min, max, decimalPlaces: places } = rule.value;
    if ((min !== null && result.value < min) || (max !== null && result.value > max)) return { ok: false, error: "答案超出本题规定的范围（包含上下限）" };
    if (places !== null && decimalPlaces(result.value) > places) return { ok: false, error: `最多允许 ${places} 位小数；不会自动舍入` };
    return result;
}
export function numericQuestionDescription(raw: unknown): string {
    const parsed = parseNumericQuestionRule(raw);
    if (!parsed.ok) return `数值题规则无效：${parsed.error}`;
    const r = parsed.value;
    const range = r.min === null && r.max === null ? "不限制范围" : `${r.min ?? "不限下限"} ～ ${r.max ?? "不限上限"}（含边界）`;
    return `单位：${r.unit || "未声明"}；${range}；${r.decimalPlaces === null ? "不限制小数位" : r.decimalPlaces === 0 ? "仅整数" : `最多 ${r.decimalPlaces} 位小数`}。不自动舍入或换算。`;
}
