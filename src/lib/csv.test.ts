import { expect, test } from "bun:test";
import { encodeCsvCell, recordsToCsv, reserveCsvMetadataHeader, rowsToCsv } from "./csv";

test("CSV cells quote CR/LF/commas/quotes and neutralize spreadsheet formulas", () => {
    expect(encodeCsvCell("plain")).toBe("plain");
    expect(encodeCsvCell("a\rb")).toBe('"a\rb"');
    expect(encodeCsvCell('a,"b"')).toBe('"a,""b"""');
    expect(encodeCsvCell("=HYPERLINK(\"https://example.invalid\")"))
        .toBe('"\'=HYPERLINK(""https://example.invalid"")"');
    expect(encodeCsvCell(" \t-2+3")).toBe("' \t-2+3");
    expect(encodeCsvCell("\u3000@SUM(A1:A2)")).toBe("'\u3000@SUM(A1:A2)");
    expect(encodeCsvCell(-2)).toBe("-2");
});

test("CSV writer also protects user-controlled headers", () => {
    expect(recordsToCsv([{ "=cmd": "@payload" }])).toBe("'=cmd\n'@payload");
});

test("metadata headers never overwrite an existing user column", () => {
    const used = new Set(["__wj_method", "__wj_method_2"]);
    expect(reserveCsvMetadataHeader("__wj_method", used)).toBe("__wj_method_3");
});

test("rowsToCsv escapes cells and defuses formula prefixes", () => {
    expect(rowsToCsv([
        ["行号", "原因"],
        [2, "学号已存在，未做变更: S042"],
        [3, "缺少学号或姓名"],
        [4, "=1+1 公式注入"],
        [5, "含,逗号与\"引号"],
    ])).toBe([
        "行号,原因",
        "2,学号已存在，未做变更: S042",
        "3,缺少学号或姓名",
        "4,'=1+1 公式注入",
        "5,\"含,逗号与\"\"引号\"",
    ].join("\n"));
});
