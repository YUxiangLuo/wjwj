import { expect, test } from "bun:test";
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
