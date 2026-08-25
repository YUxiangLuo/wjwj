import { expect, test } from "bun:test";
import {
    attachmentContentMatchesExtension,
    getAttachmentContentType,
    getAttachmentType,
} from "./file-utils";

test("attachment type ignores spoofed MIME and uses the filename extension allowlist", () => {
    expect(getAttachmentType("guide.pdf", "video/mp4")).toBe("document");
    expect(getAttachmentType("recording.MP4", "application/octet-stream")).toBe("video");
    expect(getAttachmentType("unknown.bin", "video/mp4")).toBe("unknown");
});

test("attachment content type is derived from the allowlisted extension", () => {
    expect(getAttachmentContentType("photo.PNG")).toBe("image/png");
    expect(getAttachmentContentType("guide.pdf")).toBe("application/pdf");
    expect(getAttachmentContentType("unknown.bin")).toBe("application/octet-stream");
});

test("attachment magic bytes reject content that does not match its extension", () => {
    const text = new TextEncoder().encode("<svg><script>alert(1)</script></svg>");
    const pdf = new TextEncoder().encode("%PDF-1.7\n");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(attachmentContentMatchesExtension("spoofed.png", text)).toBe(false);
    expect(attachmentContentMatchesExtension("guide.pdf", pdf)).toBe(true);
    expect(attachmentContentMatchesExtension("photo.png", png)).toBe(true);
});
