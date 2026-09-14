import { afterAll, expect, test } from "bun:test";
import * as XLSX from "xlsx";
import { calculateUnivariate } from "../domain/variables/analysis";
import { suggestDictionary, validateDictionary } from "../domain/variables/dictionary";
import type { VariableDefinition } from "../domain/variables/types";
import { readVariableSource } from "./variable-source";

// 覆盖真实解析、字典确认、来源标识与文件限额。

const created: string[] = [];
async function writeStorage(fileName: string, bytes: ArrayBuffer | Uint8Array | string) {
    const [base = "population", extension = "csv"] = fileName.split(".");
    const path = `/storage/test/${base}-${crypto.randomUUID()}.${extension}`;
    const absolute = `${process.cwd()}${path}`;
    await Bun.write(absolute, bytes);
    created.push(absolute);
    return path;
}
function xlsxBytes(rows: unknown[][]) {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Population");
    return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
afterAll(async () => {
    for (const absolute of created) await Bun.file(absolute).delete().catch(() => undefined);
});

const F1_VALUES: unknown[] = ["01", "1", 1, false, 0, "01", null];
// F1 字典顺序：\"01\"(2), \"1\"(1), 1(1), false(1), 0(1)；有效 6、缺失 1
const F1_COUNTS = [2, 1, 1, 1, 1];

test("D01 XLSX keeps text/number/boolean raw types and confirms a dictionary via real parsing", async () => {
    // 第二列保证最终空 code 行仍是一行真实记录（XLSX 中的 null 单元）
    const path = await writeStorage("f1.xlsx", xlsxBytes([["code", "note"], ...F1_VALUES.map((value, index) => [value, `r${index}`])]));
    const mapping = { identifier: undefined, numeric: [], stratified: [], others: ["code"] };
    const source = await readVariableSource(path, mapping);
    expect(source.rows.map(row => [typeof row.code, row.code])).toEqual([
        ["string", "01"], ["string", "1"], ["number", 1], ["boolean", false], ["number", 0], ["string", "01"], ["object", null],
    ]);

    const dictionary = suggestDictionary(source.rows, source.source, 1);
    expect(dictionary.variables[0]).toMatchObject({ field: "code", kind: "nominal" });
    expect(dictionary.variables[0]!.categories.map(category => category.value)).toEqual(["01", "1", 1, false, 0]);
    const confirmed = validateDictionary(dictionary, source.rows, source.source);
    expect(confirmed).toEqual(dictionary);

    const variable = confirmed.variables[0] as VariableDefinition;
    const result = calculateUnivariate({ population: source.rows, indices: source.rows.map((_, index) => index), variable, weighted: false });
    if (result.kind !== "categorical") throw new Error("expected categorical result");
    expect(result.categories.map(category => category.count)).toEqual(F1_COUNTS);
    expect(result).toMatchObject({ validCount: 6, missingCount: 1 });
});

test("D01 CSV keeps numeric-looking text as categories and only explicit numeric roles convert", async () => {
    const csv = "code,note\n01,a\n1,b\n1,c\nfalse,d\n0,e\n01,f\n,g\n";
    const path = await writeStorage("f1.csv", csv);
    const mapping = { numeric: ["code"], stratified: [], others: [] };
    const source = await readVariableSource(path, mapping);

    // 原始视图保持文本；只有显式声明的数值角色在设计视图中转换
    expect(source.rows.map(row => row.code)).toEqual(["01", "1", "1", "false", "0", "01", ""]);
    expect(source.designRows.map(row => row.code)).toEqual([1, 1, 1, "false", 0, 1, ""]);

    // 建议基于原始视图：数字外观不得变成连续变量
    const dictionary = suggestDictionary(source.rows, source.source, 1);
    expect(dictionary.variables.find(variable => variable.field === "code")).toMatchObject({ kind: "nominal" });
    // 空单元必须可确认（作为缺失编码），不能生成空标签类别后又被自身校验拒绝
    const confirmed = validateDictionary(dictionary, source.rows, source.source);
    const codeVariable = confirmed.variables.find(variable => variable.field === "code")!;
    expect(codeVariable.categories.map(category => category.value)).toEqual(["01", "1", "false", "0"]);
    expect(codeVariable.missing).toContain("");
});

test("D03 source identity tracks bytes and target interpretation but not prose or equivalent reordering", async () => {
    const csv = "id,y,g\n1,10,A\n2,20,B\n";
    const path = await writeStorage("source.csv", csv);
    const mapping = {
        identifier: "id", numeric: ["y"], stratified: ["g"],
        studyContract: { version: 1, researchQuestion: "第一版研究问题", targetPopulation: "总体", unitOfAnalysis: "一行", target: { kind: "mean", field: "y" } },
    };
    const first = await readVariableSource(path, mapping);
    const again = await readVariableSource(path, mapping);
    expect(again.source).toBe(first.source);
    expect(again.fileHash).toBe(first.fileHash);

    // 仅研究说明文字变化：来源标识不变
    const proseOnly = await readVariableSource(path, { ...mapping, studyContract: { ...mapping.studyContract, researchQuestion: "第二版研究问题" } });
    expect(proseOnly.source).toBe(first.source);

    // 等价重排：对象键顺序与角色数组顺序不影响来源标识
    const reordered = await readVariableSource(path, {
        stratified: ["g"], numeric: ["y"], identifier: "id",
        studyContract: { target: { field: "y", kind: "mean" }, unitOfAnalysis: "一行", targetPopulation: "总体", researchQuestion: "第一版研究问题", version: 1 },
    });
    expect(reordered.source).toBe(first.source);

    // 真正改变目标解释：来源标识变化
    const retargeted = await readVariableSource(path, { ...mapping, studyContract: { ...mapping.studyContract, target: { kind: "mean", field: "id" } } });
    expect(retargeted.source).not.toBe(first.source);

    // 同一路径换字节：fileHash 与 source 都变化；换回原字节后恢复确定值
    await Bun.write(`${process.cwd()}${path}`, "id,y,g\n1,10,A\n2,21,B\n");
    const changed = await readVariableSource(path, mapping);
    expect(changed.fileHash).not.toBe(first.fileHash);
    expect(changed.source).not.toBe(first.source);
    await Bun.write(`${process.cwd()}${path}`, csv);
    expect((await readVariableSource(path, mapping)).source).toBe(first.source);
});

test("D07 rejects empty, oversized, malformed and corrupt populations without truncating", async () => {
    const empty = await writeStorage("empty.csv", "id,y\n");
    await expect(readVariableSource(empty, { identifier: "id", numeric: ["y"] })).rejects.toThrow(/总体数据无效/);

    const malformed = await writeStorage("malformed.csv", "id,y\n1,2\n3,4,5\n");
    await expect(readVariableSource(malformed, { identifier: "id", numeric: ["y"] })).rejects.toThrow(/总体数据无效/);

    const corrupt = await writeStorage("corrupt.xlsx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02]));
    await expect(readVariableSource(corrupt, { identifier: "id", numeric: ["y"] })).rejects.toThrow();

    const tooManyRows = [`id,y`, ...Array.from({ length: 100_001 }, (_, index) => `${index},${index}`)].join("\n");
    await expect(readVariableSource(await writeStorage("rows.csv", tooManyRows), { identifier: "id", numeric: ["y"] })).rejects.toThrow(/总体数据无效/);

    const columns51 = Array.from({ length: 51 }, (_, index) => `c${index}`);
    const wide = [columns51.join(","), columns51.map(() => "1").join(",")].join("\n");
    await expect(readVariableSource(await writeStorage("cols.csv", wide), { identifier: "c0", numeric: ["c1"] })).rejects.toThrow(/总体数据无效/);
});

test("Q06 preview question ranges never filter or alter the population used by sampling and analysis", async () => {
    const path = await writeStorage("q06.csv", "id,y\n1,0\n2,5\n3,100\n");
    const mapping = { identifier: "id", numeric: ["y"], stratified: [], others: [] };
    const plain = await readVariableSource(path, mapping);
    // 题目与试填内容不是来源标识的一部分：反复修改问卷不得使已确认字典失效
    const withQuestionnaire = await readVariableSource(path, {
        ...mapping,
        questionnaire: { title: "预试", questions: [{ id: "q", type: "numeric", numericMin: 0, numericMax: 10, decimalPlaces: 0 }] },
    });
    expect(withQuestionnaire.source).toBe(plain.source);

    // 试填范围 0–10 不得筛选、截断或改写总体：100 仍参与统计
    const variable: VariableDefinition = { field: "y", label: "值", unit: "", kind: "continuous", categories: [], missing: [] };
    const result = calculateUnivariate({ population: plain.rows, indices: plain.rows.map((_, index) => index), variable, weighted: false });
    if (result.kind !== "numeric") throw new Error("expected numeric result");
    expect(result).toMatchObject({ validCount: 3, mean: 35, min: 0, max: 100 });
});

test("D07 accepts exactly 100000 rows and 50 columns and keeps raw/design row order aligned", async () => {
    const columns = Array.from({ length: 49 }, (_, index) => `c${index + 1}`);
    const header = ["id", ...columns];
    const lines = [header.join(",")];
    for (let index = 0; index < 100_000; index += 1) {
        lines.push(`id${index},${columns.map(() => "1").join(",")}`);
    }
    const path = await writeStorage("max.csv", lines.join("\n"));
    const mapping = { identifier: "id", numeric: columns };
    const source = await readVariableSource(path, mapping);
    expect(source.rows).toHaveLength(100_000);
    expect(source.rows[0]!.id).toBe("id0");
    expect(source.rows.at(-1)!.id).toBe("id99999");
    // 原始视图保留文本，设计视图转换数值；两者行序必须一致
    expect(source.rows[0]!.c1).toBe("1");
    expect(source.designRows[0]!.c1).toBe(1);
    expect(source.designRows.length).toBe(source.rows.length);
    expect(source.designRows.at(-1)!.c1).toBe(1);
});
