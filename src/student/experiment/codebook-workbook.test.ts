import { expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { bindingDictionary, boundQuestionnaire, bindingFor } from "@/test-utils/question-variable-binding";
import { questionBindingSignature } from "@/domain/experiment/question-variable-binding";
import { buildCodebookWorkbook, type CodebookInput } from "./codebook-workbook";
function fixture(): CodebookInput {
    const dictionary = bindingDictionary(), questionnaire = boundQuestionnaire();
    questionnaire.questions.push({ id: "amount", type: "numeric", content: "实际金额？", numberRule: { unit: "", min: 0, max: 200, decimalPlaces: 2 } });
    const numeric = questionnaire.questions.at(-1)!;
    numeric.variableBinding = { schemaVersion: 1, taskId: 3, datasetRevision: dictionary.datasetRevision, dictionaryRevision: dictionary.revision, questionSignature: questionBindingSignature(numeric), kind: "continuous", variableId: "v_5" };
    const multiple = { id: "multi", type: "multiple" as const, content: "哪些项符合？", options: ["二值选项", "二级指标"], optionIds: ["m_a", "m_b"], minSelect: 1, maxSelect: 2 };
    questionnaire.questions.push({ ...multiple, variableBinding: { schemaVersion: 1, taskId: 3, datasetRevision: dictionary.datasetRevision, dictionaryRevision: dictionary.revision, questionSignature: questionBindingSignature(multiple), kind: "multiple-binary", answers: [{ answerId: "m_a", variableId: "v_3", value: false }, { answerId: "m_b", variableId: "v_4", value: 1 }] } });
    const scale = { id: "scale", type: "scale" as const, content: "有序评分？", scaleMin: 1, scaleMax: 2 }; questionnaire.questions.push({ ...scale, variableBinding: bindingFor(scale, dictionary, "v_4") });
    const fields = dictionary.variables.map(v => v.sourceField);
    const population = Array.from({ length: 4 }, (_, i) => Object.fromEntries(fields.map((f, j) => [f, ["00" + (i + 1), i % 2 ? 1 : "01", Boolean(i % 2), i % 2 + 1, (i + 1) * 10][j]])));
    return { experimentId: 5, taskId: 3, version: 8, source: "submitted", dictionary, questionnaire, populationFileSha256: "b".repeat(64), population, type: "all", results: {
        simple: { completed: true, seed: 42, sampleCount: 2, indices: [0, 1] },
        systematic: { completed: true, seed: 42, sampleCount: 2, indices: [0, 2], interval: 2, randomStart: 0.2 },
        pps: { completed: true, seed: 42, sampleCount: 2, indices: [1, 3], sizeField: fields[4], randomStart: 0.3, inclusionProbabilities: [0.4, 0.8] },
        stratified: { completed: true, seed: 42, sampleCount: 2, indices: [0, 1], stratifyBy: fields[1], layers: [{ name: "01", count: 2, sampleCount: 1 }, { name: "1", count: 2, sampleCount: 1 }] },
    } };
}
const read = (input: CodebookInput) => XLSX.read(buildCodebookWorkbook(input), { type: "buffer" });
const rows = (book: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<any[]>(book.Sheets[name]!, { header: 1, defval: null, raw: true });
test("codebook keeps every source field, typed raw values and genuine selected row order, separate from metadata", () => {
    const input = fixture(), before = structuredClone(input), book = read(input);
    expect(input).toEqual(before);
    expect(rows(book, "样本_simple")).toEqual([input.dictionary.variables.map(v => v.sourceField), ...[0, 1].map(i => input.dictionary.variables.map(v => input.population[i]![v.sourceField]))] as any);
    expect(book.Sheets["样本_simple"]!.A2).toMatchObject({ t: "s", v: "001" });
    expect(book.Sheets["样本_simple"]!.B2).toMatchObject({ t: "s", v: "01" });
    expect(book.Sheets["样本_simple"]!.B3).toMatchObject({ t: "n", v: 1 });
    expect(book.Sheets["样本_simple"]!.C2).toMatchObject({ t: "b", v: false });
    expect(rows(book, "抽样记录").slice(1).map(r => [r[0], r[2], r[3], r[4]])).toEqual([
        ["simple",1,0.5,2],["simple",2,0.5,2],["systematic",1,0.5,2],["systematic",3,0.5,2],["pps",2,0.4,2.5],["pps",4,0.8,1.25],["stratified",1,0.5,2],["stratified",2,0.5,2],
    ]);
    expect(rows(book, "编码与缺失").some(r => r[6] === '["string","01"]')).toBe(true);
    expect(rows(book, "编码与缺失").some(r => r[6] === '["number",1]')).toBe(true);
    expect(rows(book, "编码与缺失").some(r => r[2] === "声明缺失" && r[5] === "N/A")).toBe(true);
    expect(rows(book, "题目变量关联").find(r => r[1] === "continuous")).toEqual(["amount", "continuous", "", "v_5", "连续金额", "", "", ""]);
    expect(rows(book, "题目变量关联").filter(r => r[0] === "scale").map(r => r[6])).toEqual([1, 2]);
    expect(rows(book, "题目变量关联").filter(r => r[0] === "multi").map(r => [r[2], r[3], r[5], r[6]])).toEqual([["m_a", "v_3", "boolean", false], ["m_b", "v_4", "number", 1]]);
});
test("formula-like source text is a literal string, not a formula, hyperlink, or apostrophe-modified code", () => {
    const input = fixture(); const field = input.dictionary.variables[0]!.sourceField;
    input.population[0]![field] = '=HYPERLINK("https://invalid.test","x")'; input.population[1]![field] = "+cmd";
    const book = read(input);
    expect(book.Sheets["样本_simple"]!.A2).toMatchObject({ t: "s", v: input.population[0]![field] });
    for (const sheet of Object.values(book.Sheets)) for (const [key, cell] of Object.entries(sheet)) if (!key.startsWith("!")) { expect(cell.f).toBeUndefined(); expect(cell.l).toBeUndefined(); }
});
test("one-method export excludes other samples but retains the full dictionary", () => {
    const input = fixture(); input.type = "pps"; const book = read(input);
    expect(book.SheetNames.filter(n => n.startsWith("样本_"))).toEqual(["样本_pps"]);
    expect(rows(book, "变量")).toHaveLength(input.dictionary.variables.length + 1);
});
for (const kind of ["indices", "count", "probabilities", "weight-overflow", "systematic-old", "strata", "extra-field", "unit", "cell-limit"]) test(`codebook rejects ${kind} instead of guessing, dropping or repairing`, () => {
    const input = fixture(), result = input.results as any;
    if (kind === "indices") result.simple.indices = [0, 0];
    if (kind === "count") result.simple.sampleCount = "2";
    if (kind === "probabilities") result.pps.inclusionProbabilities = [0.4];
    if (kind === "weight-overflow") result.pps.inclusionProbabilities = [5e-324, 0.8];
    if (kind === "systematic-old") { delete result.systematic.interval; result.systematic.kValue = 2; }
    if (kind === "strata") result.stratified.layers[0].count = 3;
    if (kind === "extra-field") input.population[0]!.notInDictionary = "never drop";
    if (kind === "unit") input.dictionary.variables[4]!.unit = "元";
    if (kind === "cell-limit") input.population[0]![input.dictionary.variables[0]!.sourceField] = "a".repeat(32768);
    expect(() => read(input)).toThrow();
});
test("declared missing values and zero survive without replacing actual n with valid-case counts", () => {
    const input = fixture(); input.type = "simple";
    input.population[0]!["连续金额"] = "N/A"; input.population[1]!["连续金额"] = 0;
    const book = read(input); expect(book.Sheets["样本_simple"]!.E2.v).toBe("N/A"); expect(book.Sheets["样本_simple"]!.E3.v).toBe(0);
    expect(rows(book, "抽样记录").slice(1).map(r => r[4])).toEqual([2, 2]);
});
test("oversized exports fail before worksheet creation instead of truncating or sampling the records", () => {
    const input = fixture(); input.type = "simple"; input.population = Array(100000).fill(input.population[0]);
    (input.results as any).simple = { completed: true, seed: 42, sampleCount: 100000, indices: Array.from({ length: 100000 }, (_, i) => i) };
    expect(() => read(input)).toThrow("码本超过导出容量"); expect((input.results as any).simple.sampleCount).toBe(100000);
});
test("an unavailable PPS record is disclosed, never replaced with an invented sample", () => {
    const input = fixture(); (input.results as any).pps = { unavailable: true, unavailableReason: "精度不足" };
    const book = read(input); expect(book.SheetNames).not.toContain("样本_pps");
    expect(rows(book, "抽样设计").find(r => r[0] === "pps")?.[9]).toBe("精度不足");
    input.type = "pps"; expect(() => read(input)).toThrow("暂无可导出");
});
