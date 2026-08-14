import { expect, test } from "bun:test";
import { getAttachmentType } from "./file-utils";

test("attachment type ignores spoofed MIME and uses the filename extension allowlist", () => {
    expect(getAttachmentType("guide.pdf", "video/mp4")).toBe("document");
    expect(getAttachmentType("recording.MP4", "application/octet-stream")).toBe("video");
    expect(getAttachmentType("unknown.bin", "video/mp4")).toBe("unknown");
});
