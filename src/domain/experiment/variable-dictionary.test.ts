import { expect, test } from "bun:test";
import {
    isVariableMissing, MAX_VARIABLE_DICTIONARY_BYTES, parseVariableDictionary,
    suggestVariableDictionary, validateDictionaryPopulation, variableValueKey,
} from "./variable-dictionary";

function source() {
    return {
        columns: ["编号", " 金额 ", "类别"], identifier: "编号", numeric: [" 金额 "], datasetRevision: "a".repeat(64),
        rows: [{ 编号: "001", " 金额 ": 10.25, 类别: "10²" }, { 编号: "002", " 金额 ": 12, 类别: "102" }],
    };
}
function dictionary() { return suggestVariableDictionary(source()); }

test("suggestions preserve source keys/codes and never infer numeric IDs or ordinal meaning", () => {
    const value = dictionary();
    expect(value.revision).toBe(0);
    expect(parseVariableDictionary(value).ok).toBe(true);
    expect(value.variables[0]).toMatchObject({ storageType: "text", measurementLevel: "id" });
    expect(value.variables[1]).toMatchObject({ sourceField: " 金额 ", storageType: "number", measurementLevel: "continuous" });
    expect(value.variables[2]?.categories).toEqual([{ value: "10²", label: "10²" }, { value: "102", label: "102" }]);
    expect(validateDictionaryPopulation(value, source())).toBeNull();
    expect(source().rows[0]?.编号).toBe("001");
});

test("code identity preserves type, case, full width, mathematical meaning and spaces", () => {
    const values = ["01", "1", 1, "true", true, "A", "a", "Ａ", "10²", "102", " x", "x"];
    expect(new Set(values.map(variableValueKey)).size).toBe(values.length);
    expect(isVariableMissing(99, ["99"])).toBe(false);
    expect(isVariableMissing("99", [99])).toBe(false);
    for (const value of [null, undefined, "", "  ", 99]) expect(isVariableMissing(value, [99])).toBe(true);
    expect(isVariableMissing(0, [])).toBe(false);
    expect(isVariableMissing(false, [])).toBe(false);
});

for (const mutate of [
    (d: any) => { d.schemaVersion = 2; },
    (d: any) => { d.parserVersion = "future"; },
    (d: any) => { d.revision = -1; },
    (d: any) => { d.revision = "1"; },
    (d: any) => { d.revision = 1.5; },
    (d: any) => { d.datasetRevision = "path.csv"; },
    (d: any) => { d.variables[1].id = d.variables[0].id; },
    (d: any) => { d.variables[1].sourceField = d.variables[0].sourceField; },
    (d: any) => { d.variables[1].storageType = "text"; },
    (d: any) => { d.variables[1].missingValues = [Infinity]; },
    (d: any) => { d.variables[1].missingValues = ["99", "99"]; },
    (d: any) => { d.variables[1].label = "a\0b"; },
    (d: any) => { d.variables[2].categories.push({ ...d.variables[2].categories[0] }); },
    (d: any) => { d.variables[2].missingValues = ["10²"]; },
    (d: any) => { d.variables[2].categories = []; },
    (d: any) => { d.variables[0].missingValues = ["001"]; },
]) {
    test(`strict dictionary boundary rejects ${mutate.toString()}`, () => {
        const value = dictionary(); mutate(value);
        expect(parseVariableDictionary(value).ok).toBe(false);
    });
}

test("parser copies metadata and strips untrusted generated results", () => {
    const input = { ...dictionary(), sourceRows: [{ fake: true }], results: { estimate: 100 } };
    const result = parseVariableDictionary(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).not.toHaveProperty("sourceRows");
    expect(result.value).not.toHaveProperty("results");
    input.variables[2]!.categories[0]!.label = "改写";
    expect(result.value.variables[2]?.categories[0]?.label).toBe("10²");
});

test("whole-population validation catches uncovered values after the preview", () => {
    const data = source();
    data.rows = Array.from({ length: 21 }, (_, i) => ({ 编号: String(i), " 金额 ": i + 1, 类别: i === 20 ? "缺漏" : i % 2 ? "102" : "10²" }));
    expect(validateDictionaryPopulation(dictionary(), data)).toContain("第21行");
});

test("cannot invent/drop/reorder fields or move the existing identifier role", () => {
    const value = dictionary();
    value.variables[1]!.sourceField = "金额";
    expect(validateDictionaryPopulation(value, source())).toContain("源字段");
    value.variables = dictionary().variables.slice(0, 2);
    expect(validateDictionaryPopulation(value, source())).toContain("全部");
    value.variables = dictionary().variables.reverse();
    expect(validateDictionaryPopulation(value, source())).toContain("身份");
    const changed = dictionary(); changed.variables[0]!.measurementLevel = "unclassified";
    expect(validateDictionaryPopulation(changed, source())).toContain("标识符");
});

test("categories must cover exact actual values; declared missing values are excluded", () => {
    const value = dictionary();
    value.variables[2]!.categories.push({ value: "虚构", label: "额外答案" });
    expect(validateDictionaryPopulation(value, source())).toContain("不存在");
    value.variables[2]!.categories = [{ value: "102", label: "正常" }];
    value.variables[2]!.missingValues = ["10²"];
    expect(parseVariableDictionary(value).ok).toBe(true);
    expect(validateDictionaryPopulation(value, source())).toBeNull();
});

test("missing/nonfinite analysis values are never silently converted to zero", () => {
    const data = source() as { columns: string[]; identifier: string; rows: Record<string, unknown>[] };
    data.rows[0]![" 金额 "] = "N/A";
    expect(validateDictionaryPopulation(dictionary(), data)).toContain("不是有效数值");
    const value = dictionary(); value.variables[1]!.missingValues = ["N/A"];
    expect(validateDictionaryPopulation(value, data)).toBeNull();
    data.rows[1]![" 金额 "] = null;
    expect(validateDictionaryPopulation(value, data)).toContain("没有可分析");
});

test("high-cardinality or long-text fields stay unclassified, not truncated categories", () => {
    for (const values of [Array.from({ length: 51 }, (_, i) => String(i)), ["长".repeat(201)]]) {
        const value = suggestVariableDictionary({ columns: ["id", "text"], identifier: "id", datasetRevision: "a".repeat(64), rows: values.map((text, i) => ({ id: String(i), text })) });
        expect(value.variables[1]).toMatchObject({ measurementLevel: "unclassified", categories: [] });
        expect(parseVariableDictionary(value).ok).toBe(true);
    }
});

test("suggestions are bounded and still retain every column", () => {
    const columns = Array.from({ length: 50 }, (_, i) => `列${i}`);
    const rows = Array.from({ length: 50 }, (_, i) => Object.fromEntries(columns.map(c => [c, `${i}${"长".repeat(180)}`])));
    const value = suggestVariableDictionary({ columns, rows, datasetRevision: "a".repeat(64) });
    expect(value.variables.length).toBe(50);
    expect(new TextEncoder().encode(JSON.stringify(value)).length).toBeLessThan(MAX_VARIABLE_DICTIONARY_BYTES);
    expect(parseVariableDictionary(value).ok).toBe(true);
    expect(value.variables.some(v => v.measurementLevel === "unclassified")).toBe(true);
});
