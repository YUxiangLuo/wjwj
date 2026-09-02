import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { error } from "./http";
import { resolveStoragePath } from "./storage-files";

export function inferAttachmentMimeType(fileName: string) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (/\.(jpe?g)$/.test(lower)) return "image/jpeg";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".bmp")) return "image/bmp";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".ogg")) return "video/ogg";
    if (lower.endsWith(".mov")) return "video/quicktime";
    if (lower.endsWith(".pdf")) return "application/pdf";
    return "application/octet-stream";
}

function canInlinePreview(contentType: string) {
    return (
        contentType.startsWith("image/")
        || contentType.startsWith("video/")
        || contentType === "application/pdf"
    );
}

type ByteRange = { start: number; end: number };

function parseSingleByteRange(header: string | null, fileSize: number): ByteRange | null | "invalid" {
    if (!header) return null;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || (!match[1] && !match[2]) || fileSize <= 0) return "invalid";

    if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
        return { start: Math.max(0, fileSize - suffixLength), end: fileSize - 1 };
    }

    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
    if (
        !Number.isSafeInteger(start)
        || !Number.isSafeInteger(requestedEnd)
        || start < 0
        || start >= fileSize
        || requestedEnd < start
    ) {
        return "invalid";
    }
    return { start, end: Math.min(requestedEnd, fileSize - 1) };
}

/** Serve an already-authorized storage attachment without exposing its path. */
export async function buildAttachmentDownloadResponse(params: {
    request: Request;
    fileName: string;
    filePath: string;
}) {
    let fullPath: string;
    try {
        fullPath = resolveStoragePath(params.filePath);
    } catch {
        return error("无效的文件路径", "INVALID_PATH", 400);
    }

    try {
        const file = Bun.file(fullPath);
        if (!(await file.exists())) return error("文件不存在", "NOT_FOUND", 404);
        const mode = new URL(params.request.url).searchParams.get("mode");
        const inferredType = inferAttachmentMimeType(params.fileName);
        const isPreviewMode = mode === "preview" && canInlinePreview(inferredType);
        const headers = new Headers({
            "Accept-Ranges": "bytes",
            "Content-Type": isPreviewMode ? inferredType : "application/octet-stream",
            "Content-Disposition": `${isPreviewMode ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(params.fileName)}`,
            "X-Content-Type-Options": "nosniff",
            ...(isPreviewMode ? { "Content-Security-Policy": "sandbox; default-src 'none'; img-src data: blob:; media-src blob:" } : {}),
        });
        const range = parseSingleByteRange(params.request.headers.get("range"), file.size);
        if (range === "invalid") {
            headers.set("Content-Range", `bytes */${file.size}`);
            headers.set("Content-Length", "0");
            return new Response(null, { status: 416, headers });
        }
        if (range) {
            headers.set("Content-Range", `bytes ${range.start}-${range.end}/${file.size}`);
            headers.set("Content-Length", String(range.end - range.start + 1));
            const stream = Readable.toWeb(createReadStream(fullPath, { start: range.start, end: range.end }));
            return new Response(stream as unknown as ReadableStream<Uint8Array>, { status: 206, headers });
        }

        headers.set("Content-Length", String(file.size));
        return new Response(file, { headers });
    } catch {
        return error("文件不存在", "NOT_FOUND", 404);
    }
}
