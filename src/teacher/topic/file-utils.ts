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

export function getAttachmentContentType(fileName: string) {
    const name = fileName.trim().toLowerCase();
    if (name.endsWith(".png")) return "image/png";
    if (/\.jpe?g$/.test(name)) return "image/jpeg";
    if (name.endsWith(".gif")) return "image/gif";
    if (name.endsWith(".mp4")) return "video/mp4";
    if (name.endsWith(".webm")) return "video/webm";
    if (name.endsWith(".pdf")) return "application/pdf";
    if (name.endsWith(".doc")) return "application/msword";
    if (name.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (name.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
    if (name.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    return "application/octet-stream";
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
    return signature.every((value, index) => bytes[index] === value);
}

/** Basic magic-byte validation; stored and served MIME is always derived from the allowlisted extension. */
export function attachmentContentMatchesExtension(fileName: string, bytes: Uint8Array) {
    const name = fileName.trim().toLowerCase();
    if (name.endsWith(".png")) return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (/\.jpe?g$/.test(name)) return startsWithBytes(bytes, [0xff, 0xd8, 0xff]);
    if (name.endsWith(".gif")) {
        const header = new TextDecoder("ascii").decode(bytes.subarray(0, 6));
        return header === "GIF87a" || header === "GIF89a";
    }
    if (name.endsWith(".mp4")) {
        return bytes.length >= 12 && new TextDecoder("ascii").decode(bytes.subarray(4, 8)) === "ftyp";
    }
    if (name.endsWith(".webm")) return startsWithBytes(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    if (name.endsWith(".pdf")) {
        return new TextDecoder("ascii").decode(bytes.subarray(0, 1024)).includes("%PDF-");
    }
    if (name.endsWith(".doc") || name.endsWith(".ppt")) {
        return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    }
    if (name.endsWith(".docx") || name.endsWith(".pptx")) {
        return startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04])
            || startsWithBytes(bytes, [0x50, 0x4b, 0x05, 0x06])
            || startsWithBytes(bytes, [0x50, 0x4b, 0x07, 0x08]);
    }
    return false;
}
