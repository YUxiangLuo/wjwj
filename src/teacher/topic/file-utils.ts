import { basename } from "node:path";

export { parseSpreadsheetFile as parseExcelFile } from "../../lib/spreadsheet";

export function sanitizeUploadFileName(originalName: string) {
    const fileName = basename(originalName)
        .replace(/[\x00-\x1F\x7F]/g, "")
        .replace(/[\\/]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 120);

    return fileName || "upload.bin";
}

export function isRowEmpty(row: Record<string, any>) {
    return Object.values(row).every((value) => `${value ?? ""}`.trim() === "");
}

export function getAttachmentType(fileName: string, _mimeType?: string) {
    const name = fileName.trim().toLowerCase();
    if (/(\.png|\.jpg|\.jpeg|\.gif)$/.test(name)) return "image";
    if (/(\.mp4|\.webm)$/.test(name)) return "video";
    if (/(\.pdf|\.doc|\.docx|\.ppt|\.pptx)$/.test(name)) return "document";
    return "unknown";
}
