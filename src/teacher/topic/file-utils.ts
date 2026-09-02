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

function zipEntryNames(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const minimumOffset = Math.max(0, bytes.length - 65_557);
    let endOffset = -1;
    for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
        if (view.getUint32(offset, true) === 0x06054b50) {
            endOffset = offset;
            break;
        }
    }
    if (endOffset < 0) return null;
    const entryCount = view.getUint16(endOffset + 10, true);
    let offset = view.getUint32(endOffset + 16, true);
    const names = new Set<string>();
    for (let entry = 0; entry < entryCount; entry += 1) {
        if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return null;
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const nameStart = offset + 46;
        if (nameStart + nameLength > bytes.length) return null;
        names.add(new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLength)));
        offset = nameStart + nameLength + extraLength + commentLength;
    }
    return names;
}

function hasValidPdfCrossReference(bytes: Uint8Array) {
    const decoder = new TextDecoder("latin1");
    const header = decoder.decode(bytes.subarray(0, 8));
    if (!header.startsWith("%PDF-")) return false;
    const trailer = decoder.decode(bytes.subarray(Math.max(0, bytes.length - 4096)));
    const match = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(trailer);
    if (!match) return false;
    const offset = Number(match[1]);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= bytes.length) return false;
    const crossReference = decoder.decode(bytes.subarray(offset, Math.min(bytes.length, offset + 1024)));
    return crossReference.startsWith("xref") || /\/Type\s*\/XRef\b/.test(crossReference);
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
        return hasValidPdfCrossReference(bytes);
    }
    if (name.endsWith(".doc") || name.endsWith(".ppt")) {
        return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    }
    if (name.endsWith(".docx") || name.endsWith(".pptx")) {
        const entries = zipEntryNames(bytes);
        if (!entries?.has("[Content_Types].xml") || !entries.has("_rels/.rels")) return false;
        return name.endsWith(".docx")
            ? entries.has("word/document.xml")
            : entries.has("ppt/presentation.xml");
    }
    return false;
}
