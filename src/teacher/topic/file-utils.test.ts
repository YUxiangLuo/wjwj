import { expect, test } from "bun:test";
import {
    attachmentContentMatchesExtension,
    getAttachmentContentType,
    getAttachmentType,
    sanitizeUploadFileName,
} from "./file-utils";

test("attachment type ignores spoofed MIME and uses the filename extension allowlist", () => {
    expect(getAttachmentType("guide.pdf", "video/mp4")).toBe("document");
    expect(getAttachmentType("recording.MP4", "application/octet-stream")).toBe("video");
    expect(getAttachmentType("unknown.bin", "video/mp4")).toBe("unknown");
});

test("upload file names stay within the filesystem byte budget", () => {
    const encoder = new TextEncoder();
    expect(sanitizeUploadFileName("report final.csv")).toBe("report_final.csv");
    expect(sanitizeUploadFileName("../../evil.csv")).toBe("evil.csv");
    expect(sanitizeUploadFileName("")).toBe("upload.bin");
    // 120 个中文字符约 360 字节，必须按字节截断且保留扩展名
    const chinese = sanitizeUploadFileName(`${"很长的中文附件名".repeat(20)}.png`);
    expect(chinese.endsWith(".png")).toBe(true);
    expect(encoder.encode(chinese).length).toBeLessThanOrEqual(180);
    const ascii = sanitizeUploadFileName(`${"a".repeat(200)}.png`);
    expect(ascii.endsWith(".png")).toBe(true);
    expect(ascii.length).toBeLessThanOrEqual(132);
    expect(encoder.encode(ascii).length).toBeLessThanOrEqual(180);
    // 无扩展名的超长中文名同样受限
    expect(encoder.encode(sanitizeUploadFileName("中".repeat(120))).length).toBeLessThanOrEqual(180);
});

test("attachment content type is derived from the allowlisted extension", () => {
    expect(getAttachmentContentType("photo.PNG")).toBe("image/png");
    expect(getAttachmentContentType("guide.pdf")).toBe("application/pdf");
    expect(getAttachmentContentType("unknown.bin")).toBe("application/octet-stream");
});

test("attachment structure validation rejects content that does not match its extension", async () => {
    const text = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    const pdf = new Uint8Array(await Bun.file(`${process.cwd()}/public/templates/调查问卷设计规范与模板.pdf`).arrayBuffer());
    const docx = new Uint8Array(await Bun.file(`${process.cwd()}/public/templates/调查问卷设计规范与模板.docx`).arrayBuffer());
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(attachmentContentMatchesExtension("spoofed.png", text)).toBe(false);
    expect(attachmentContentMatchesExtension("guide.pdf", pdf)).toBe(true);
    expect(attachmentContentMatchesExtension("photo.png", png)).toBe(true);
    expect(attachmentContentMatchesExtension("guide.docx", docx)).toBe(true);
    expect(attachmentContentMatchesExtension("spoofed.pptx", docx)).toBe(false);
    expect(attachmentContentMatchesExtension("fake.pdf", new TextEncoder().encode("<html>%PDF-1.7</html>"))).toBe(false);
    expect(attachmentContentMatchesExtension("truncated.pdf", new TextEncoder().encode("%PDF-1.7\nbody"))).toBe(false);
    expect(attachmentContentMatchesExtension("header-and-eof-only.pdf", new TextEncoder().encode("%PDF-1.7\n<html>fake</html>\n%%EOF"))).toBe(false);
});
