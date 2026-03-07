import { basename } from "node:path";
import * as XLSX from "xlsx";

export function sanitizeUploadFileName(originalName: string) {
    const fileName = basename(originalName)
        .replace(/[\x00-\x1F\x7F]/g, "")
        .replace(/[\\/]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 120);

    return fileName || "upload.bin";
}

export async function parseExcelFile(buffer: ArrayBuffer, fileName?: string | null) {
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

export function isRowEmpty(row: Record<string, any>) {
    return Object.values(row).every((value) => `${value ?? ""}`.trim() === "");
}

export function getAttachmentType(fileName: string, mimeType: string) {
    const name = fileName.toLowerCase();
    if (mimeType.startsWith("image/") || /(\.png|\.jpg|\.jpeg|\.gif)$/.test(name)) return "image";
    if (mimeType.startsWith("video/") || /(\.mp4|\.webm)$/.test(name)) return "video";
    if (/(\.pdf|\.doc|\.docx|\.ppt|\.pptx)$/.test(name)) return "document";
    return "unknown";
}
