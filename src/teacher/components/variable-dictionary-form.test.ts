import { expect, test } from "bun:test";
import { suggestVariableDictionary } from "@/domain/experiment/variable-dictionary";
import { buildDictionaryDraft, dictionaryDraft, readCodeDraft } from "./variable-dictionary-form";

function source() {
    return suggestVariableDictionary({ columns: ["编号", " 金额 ", "类别"], identifier: "编号", numeric: [" 金额 "], datasetRevision: "a".repeat(64),
        rows: [{ 编号: "001", " 金额 ": 12.5, 类别: "01" }, { 编号: "002", " 金额 ": 0, 类别: "1" }] });
}
test("dictionary form roundtrips exact fields, source identity, revision and typed values without mutating source", () => {
    const base = source(); base.revision = 7;
    base.variables[2]!.categories = ["01", "1", 1, false, "10²", "102"].map(value => ({ value, label: String(value) }));
    base.variables[1]!.missingValues = [0, false, " N/A "];
    const before = structuredClone(base);
    const draft = dictionaryDraft(base);
    expect(buildDictionaryDraft(base, draft)).toEqual({ ok: true, value: base });
    draft[2]!.categories[0]!.label = "变更显示标签";
    expect(base).toEqual(before);
});
test("hidden category edits survive local measurement switching but are not sent for noncategorical types", () => {
    const base = source(); const draft = dictionaryDraft(base);
    draft[2]!.categories[0]!.label = "第一类";
    draft[2]!.measurementLevel = "unclassified";
    const result = buildDictionaryDraft(base, draft);
    expect(result.ok && result.value.variables[2]!.categories).toEqual([]);
    draft[2]!.measurementLevel = "ordinal";
    const restored = buildDictionaryDraft(base, draft);
    expect(restored.ok && restored.value.variables[2]!.categories[0]!.label).toBe("第一类");
});
test("blank numeric codes and numeric-looking text are not coerced to zero or merged", () => {
    expect(() => readCodeDraft({ kind: "number", text: "" })).toThrow();
    expect(readCodeDraft({ kind: "string", text: " 01 " })).toBe(" 01 ");
    expect(readCodeDraft({ kind: "number", text: "0" })).toBe(0);
    expect(readCodeDraft({ kind: "boolean", text: "false" })).toBe(false);
});
for (const text of ["001", " 1 ", "0x10", "NaN", "Infinity", "1e999", "1e-999", "9007199254740993", "0.10000000000000001"]) {
    test(`numeric code rejects ambiguous or precision-losing input ${JSON.stringify(text)}`, () => {
        expect(() => readCodeDraft({ kind: "number", text })).toThrow();
    });
}
test("equivalent decimal notation remains valid, including canonical large finite numbers", () => {
    for (const text of ["1.0", "1e3", "1000.00", "1e+20", "0.1", "-99", "-0", "5e-324"]) {
        expect(readCodeDraft({ kind: "number", text })).toBe(Number(text));
    }
});
test("incomplete codes identify the exact source field and never affect the base", () => {
    const base = source(); const draft = dictionaryDraft(base);
    draft[1]!.missingValues.push({ kind: "number", text: "" });
    const result = buildDictionaryDraft(base, draft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('字段 " 金额 "');
    expect(base.variables[1]!.missingValues).toEqual([]);
});
test("drafts still go through the shared duplicate/category-missing and full-contract validator", () => {
    const base = source(); const draft = dictionaryDraft(base);
    draft[2]!.missingValues.push({ ...draft[2]!.categories[0]! });
    expect(buildDictionaryDraft(base, draft).ok).toBe(false);
    draft[2]!.missingValues = [];
    draft[2]!.categories.reverse();
    const result = buildDictionaryDraft(base, draft);
    expect(result.ok && result.value.variables[2]!.categories.map(c => c.value)).toEqual(["1", "01"]);
});
