import * as XLSX from "xlsx";

export const MAX_SPREADSHEET_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_SPREADSHEET_MULTIPART_BYTES = MAX_SPREADSHEET_UPLOAD_BYTES + 1024 * 1024;

export interface SpreadsheetUploadFile {
    name: string;
    size: number;
}

export function validateSpreadsheetUploadFile(file: SpreadsheetUploadFile) {
    const normalizedName = file.name.trim().toLowerCase();
    if (!normalizedName.endsWith(".csv") && !normalizedName.endsWith(".xlsx")) {
        return { code: "INVALID_FILE", message: "仅支持 .csv 或 .xlsx 表格文件", status: 400 } as const;
    }
    if (!Number.isSafeInteger(file.size) || file.size <= 0) {
        return { code: "INVALID_FILE", message: "表格文件为空或大小无效", status: 400 } as const;
    }
    if (file.size > MAX_SPREADSHEET_UPLOAD_BYTES) {
        return { code: "FILE_TOO_LARGE", message: "表格文件不能超过20 MiB", status: 413 } as const;
    }
    return null;
}

export function spreadsheetRequestExceedsLimit(req: Request) {
    const rawLength = req.headers.get("content-length");
    if (!rawLength || !/^\d+$/.test(rawLength)) return false;
    return BigInt(rawLength) > BigInt(MAX_SPREADSHEET_MULTIPART_BYTES);
}

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
