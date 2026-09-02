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
