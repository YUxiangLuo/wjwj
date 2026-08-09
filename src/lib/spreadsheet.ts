import * as XLSX from "xlsx";

export async function parseSpreadsheetFile(buffer: ArrayBuffer, fileName?: string | null) {
    const normalizedName = fileName?.toLowerCase() ?? "";
    const workbook = normalizedName.endsWith(".csv")
        ? XLSX.read(new TextDecoder("utf-8").decode(buffer), { type: "string" })
        : XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { rows: [], columns: [], rowCount: 0, colCount: 0, preview: [] };
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { rows: [], columns: [], rowCount: 0, colCount: 0, preview: [] };

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const columns = Object.keys(rows[0] ?? {});
    return {
        rows,
        columns,
        rowCount: rows.length,
        colCount: columns.length,
        preview: rows.slice(0, 20),
    };
}
