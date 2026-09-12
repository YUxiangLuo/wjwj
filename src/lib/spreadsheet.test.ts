import { expect, test } from "bun:test";
import * as XLSX from "xlsx";
import {
    MAX_SPREADSHEET_MULTIPART_BYTES,
    MAX_SPREADSHEET_UPLOAD_BYTES,
    parseSpreadsheetFile,
    spreadsheetRequestExceedsLimit,
    validateSpreadsheetUploadFile,
} from "./spreadsheet";

test("spreadsheet upload validation accepts only nonempty csv/xlsx files within 20 MiB", () => {
    expect(validateSpreadsheetUploadFile({ name: "population.csv", size: 1 })).toBeNull();
    expect(validateSpreadsheetUploadFile({ name: "population.XLSX", size: MAX_SPREADSHEET_UPLOAD_BYTES })).toBeNull();
    expect(validateSpreadsheetUploadFile({ name: "population.xls", size: 1 })?.code).toBe("INVALID_FILE");
    expect(validateSpreadsheetUploadFile({ name: "population.xlsx", size: 0 })?.code).toBe("INVALID_FILE");
    expect(validateSpreadsheetUploadFile({ name: "population.xlsx", size: MAX_SPREADSHEET_UPLOAD_BYTES + 1 })).toEqual({
        code: "FILE_TOO_LARGE",
        message: "表格文件不能超过20 MiB",
        status: 413,
    });
});

test("spreadsheet parser preserves raw duplicate header evidence before SheetJS renames keys", async () => {
    const csv = "编号,年级, 年级 ,规模\n1,大一,一年级,10\n";
    const parsed = await parseSpreadsheetFile(new TextEncoder().encode(csv).buffer, "population.csv");

    expect(parsed.columns).toEqual(["编号", "年级", " 年级 ", "规模"]);
    expect(parsed.duplicateColumns).toEqual(["年级"]);
    expect(parsed.blankColumnIndexes).toEqual([]);
});

test("spreadsheet parser detects headers that collide after Unicode normalization", async () => {
    const parsed = await parseSpreadsheetFile(
        new TextEncoder().encode("Ａ,A,value\nleft,right,1\n").buffer,
        "population.csv",
    );
    expect(parsed.duplicateColumns).toEqual(["A"]);
});

test("spreadsheet parser preserves blank header evidence before SheetJS creates __EMPTY keys", async () => {
    const csv = "编号,,规模\n1,大一,10\n";
    const parsed = await parseSpreadsheetFile(new TextEncoder().encode(csv).buffer, "population.csv");

    expect(parsed.columns).toEqual(["编号", "__EMPTY", "规模"]);
    expect(parsed.duplicateColumns).toEqual([]);
    expect(parsed.blankColumnIndexes).toEqual([2]);
});

test("spreadsheet parser collects unique column values from all rows, not only the preview", async () => {
    const header = "编号,年级";
    const early = Array.from({ length: 20 }, (_, index) => `${index + 1},大一`).join("\n");
    const csv = `${header}\n${early}\n21,大四\n`;
    const parsed = await parseSpreadsheetFile(new TextEncoder().encode(csv).buffer, "population.csv");

    expect(parsed.preview).toHaveLength(20);
    expect(parsed.preview.some((row) => row.年级 === "大四")).toBe(false);
    expect(parsed.columnValues.年级).toEqual(["大一", "大四"]);
});

test("spreadsheet parser can skip high-cardinality column value collection", async () => {
    const csv = "编号,年级\n1,大一\n2,大四\n";
    const parsed = await parseSpreadsheetFile(
        new TextEncoder().encode(csv).buffer,
        "population.csv",
        { includeColumnValues: false },
    );

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.columnValues).toEqual({});
    expect(parsed.columnValuesTruncated).toEqual([]);
});

test("spreadsheet parser caps high-cardinality selector options and reports truncation", async () => {
    const csv = ["id,category", ...Array.from({ length: 205 }, (_, index) => `${index},C${index}`)].join("\n");
    const parsed = await parseSpreadsheetFile(new TextEncoder().encode(csv).buffer, "population.csv");
    expect(parsed.columnValues.category).toHaveLength(200);
    expect(parsed.columnValuesTruncated).toEqual(["id", "category"]);
});

test("CSV parser preserves identifiers, long integers, and date-like labels as text", async () => {
    const csv = "编号,类别,长整数\n001,1-2,123456789012345678\n";
    const parsed = await parseSpreadsheetFile(new TextEncoder().encode(csv).buffer, "population.csv");

    expect(parsed.rows[0]).toEqual({
        编号: "001",
        类别: "1-2",
        长整数: "123456789012345678",
    });
});

test("CSV parser supports quoted commas, escaped quotes, embedded newlines, and detects shape errors", async () => {
    const valid = await parseSpreadsheetFile(
        new TextEncoder().encode('id,note\n001,"line 1, ""quoted""\nline 2"\n').buffer,
        "population.csv",
    );
    expect(valid.rows[0]).toEqual({ id: "001", note: 'line 1, "quoted"\nline 2' });
    expect(valid.malformed).toBe(false);

    const malformed = await parseSpreadsheetFile(
        new TextEncoder().encode("id,note\n001,ok,extra\n").buffer,
        "population.csv",
    );
    expect(malformed.malformed).toBe(true);
    expect(malformed.malformedRow).toBe(2);
});

for (const quoted of [false, true]) {
    test(`CSV ${quoted ? "quoted" : "unquoted"} skips physical blank lines but preserves source row numbers`, async () => {
        const name = quoted ? '"学生甲"' : "学生甲";
        const parsed = await parseSpreadsheetFile(new TextEncoder().encode(
            `\ufeff\r\nstudentId,name,email\r\nS01,${name},\r\n \t\r\n,缺学号,bad@example.invalid\r\n\r\n\r\n`,
        ).buffer, "students.csv");
        expect(parsed.malformed).toBe(false);
        expect(parsed.rowCount).toBe(2);
        expect(parsed.rowNumbers).toEqual([3, 5]);
        expect(parsed.rows[0]).toEqual({ studentId: "S01", name: "学生甲", email: "" });
        expect(parsed.rows[1]?.name).toBe("缺学号");
    });

    test(`CSV ${quoted ? "quoted" : "unquoted"} still rejects nonblank shape errors after blank lines`, async () => {
        const value = quoted ? '"ok"' : "ok";
        const parsed = await parseSpreadsheetFile(new TextEncoder().encode(
            `id,value\n\n1,${value}\n \n2,bad,extra\n`,
        ).buffer, "population.csv");
        expect(parsed.malformed).toBe(true);
        expect(parsed.malformedRow).toBe(5);
        expect(parsed.rowNumbers).toEqual([3, 5]);
    });
}

test("CSV preserves explicit empty records, quoted blank content and multiline source positions", async () => {
    const parsed = await parseSpreadsheetFile(new TextEncoder().encode(
        'id,note\n\n1,"line 1\n\nline 3"\n\n2,""\n,\n\n',
    ).buffer, "population.csv");
    expect(parsed.malformed).toBe(false);
    expect(parsed.rowNumbers).toEqual([3, 7, 8]);
    expect(parsed.rows).toEqual([{ id: "1", note: "line 1\n\nline 3" }, { id: "2", note: "" }, { id: "", note: "" }]);
    const broken = await parseSpreadsheetFile(new TextEncoder().encode('id,note\n\n1,"unterminated\n\n').buffer, "population.csv");
    expect(broken.malformed).toBe(true);
});

test("CSV blank lines cannot hide an oversized population", async () => {
    const csv = `id,value\n${"\n".repeat(100_005)}${Array.from({ length: 100_002 }, (_, i) => `${i},x`).join("\n")}\n\n`;
    const parsed = await parseSpreadsheetFile(new TextEncoder().encode(csv).buffer, "population.csv", { includeColumnValues: false });
    expect(parsed.rowCount).toBe(100_001);
    expect(parsed.rowNumbers?.[0]).toBe(100_007);
    expect(parsed.rows).toHaveLength(100_001);
});

test("XLSX import row numbers retain physical blank rows", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([["studentId", "name"], ["S01", "甲"], [], ["", "缺学号"]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Students");
    const parsed = await parseSpreadsheetFile(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer, "students.xlsx");
    expect(parsed.rowNumbers).toEqual([2, 4]);
    expect(parsed.rowCount).toBe(2);
});

test("XLSX parser uses display text for identifiers and raw values only for mapped numeric fields", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([["id", "score"], [1, 1234.5]]);
    sheet.A2!.z = "000";
    sheet.B2!.z = "#,##0.00";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Population");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const displayed = await parseSpreadsheetFile(bytes, "population.xlsx");
    expect(displayed.rows[0]).toEqual({ id: "001", score: "1,234.50" });
    const mapped = await parseSpreadsheetFile(bytes, "population.xlsx", { numericFields: ["score"] });
    expect(mapped.rows[0]).toEqual({ id: "001", score: 1234.5 });
});

for (const format of ["csv", "xlsx"] as const) {
    test(`${format} normalizes only declared numeric fields, preserving category and column keys`, async () => {
        const input = [["id", "cat", "score "], ["001", "０１", "１，２００"], ["002", "02", "2e3"], ["003", "03", "not numeric"]];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(input), "Population");
        const bytes = format === "csv"
            ? new TextEncoder().encode('id,cat,score \n001,０１,１，２００\n002,02,2e3\n003,03,not numeric').buffer
            : XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        const parsed = await parseSpreadsheetFile(bytes, `population.${format}`, { numericFields: ["score "] });
        expect(parsed.rows).toEqual([
            { id: "001", cat: "０１", "score ": 1200 },
            { id: "002", cat: "02", "score ": 2000 },
            { id: "003", cat: "03", "score ": "not numeric" },
        ]);
        expect(parsed.preview).toEqual(parsed.rows);
        expect(parsed.columnValues["score "]).toEqual(["1200", "2000", "not numeric"]);
    });
}

test("spreadsheet multipart preflight rejects declared oversized bodies", () => {
    expect(spreadsheetRequestExceedsLimit(new Request("https://example.com", {
        headers: { "content-length": String(MAX_SPREADSHEET_MULTIPART_BYTES + 1) },
    }))).toBe(true);
    expect(spreadsheetRequestExceedsLimit(new Request("https://example.com", {
        headers: { "content-length": String(MAX_SPREADSHEET_MULTIPART_BYTES) },
    }))).toBe(false);
    expect(spreadsheetRequestExceedsLimit(new Request("https://example.com", {
        headers: { "content-length": "999999999999999999999999999999999999999999" },
    }))).toBe(true);
    expect(spreadsheetRequestExceedsLimit(new Request("https://example.com"))).toBe(false);
});

test("CSV parser retains only the sentinel row needed to reject an oversized population", async () => {
    const csv = `id,value\n${Array.from({ length: 100_001 }, (_, index) => `${index},x`).join("\n")}`;
    const parsed = await parseSpreadsheetFile(new TextEncoder().encode(csv).buffer, "population.csv", {
        includeColumnValues: false,
    });
    expect(parsed.rowCount).toBe(100_001);
    expect(parsed.rows).toHaveLength(100_001);
});
