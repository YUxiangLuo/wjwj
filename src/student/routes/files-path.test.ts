import { expect, test } from "bun:test";
import { join } from "node:path";
import { resolveAttachmentPath } from "./files";

test("resolveAttachmentPath supports /storage prefix", () => {
    const resolved = resolveAttachmentPath("/storage/uploads/demo.pdf");
    expect(resolved).toBe(join(process.cwd(), "storage/uploads/demo.pdf"));
});

test("resolveAttachmentPath supports storage-relative path", () => {
    const resolved = resolveAttachmentPath("uploads/demo.pdf");
    expect(resolved).toBe(join(process.cwd(), "storage/uploads/demo.pdf"));
});

test("resolveAttachmentPath rejects path traversal", () => {
    expect(() => resolveAttachmentPath("../../etc/passwd")).toThrow("INVALID_PATH");
});
