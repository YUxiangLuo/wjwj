import { expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { buildAttachmentDownloadResponse } from "./attachment-download";
import { withSecurityHeaders } from "./http";

test("attachment downloads stream full files and support single byte ranges", async () => {
    const content = "%PDF-1.7\nprotected attachment";
    const filePath = `/storage/uploads/range-${crypto.randomUUID()}.pdf`;
    const absolutePath = `${process.cwd()}${filePath}`;
    await Bun.write(absolutePath, content);

    try {
        const full = await buildAttachmentDownloadResponse({
            request: new Request("https://example.com/file?mode=preview"),
            fileName: "课堂说明.pdf",
            filePath,
        });
        expect(full.status).toBe(200);
        expect(full.headers.get("Accept-Ranges")).toBe("bytes");
        expect(full.headers.get("Content-Length")).toBe(String(new TextEncoder().encode(content).byteLength));
        expect(await full.text()).toBe(content);

        const partial = await buildAttachmentDownloadResponse({
            request: new Request("https://example.com/file?mode=preview", {
                headers: { Range: "bytes=0-3" },
            }),
            fileName: "课堂说明.pdf",
            filePath,
        });
        expect(partial.status).toBe(206);
        expect(partial.headers.get("Content-Range")).toBe(`bytes 0-3/${content.length}`);
        expect(await partial.text()).toBe("%PDF");

        const invalid = await buildAttachmentDownloadResponse({
            request: new Request("https://example.com/file", {
                headers: { Range: "bytes=999-1000" },
            }),
            fileName: "课堂说明.pdf",
            filePath,
        });
        expect(invalid.status).toBe(416);
        expect(invalid.headers.get("Content-Range")).toBe(`bytes */${content.length}`);

        const server = Bun.serve({
            port: 0,
            fetch: async (request) => withSecurityHeaders(await buildAttachmentDownloadResponse({
                request,
                fileName: "课堂说明.pdf",
                filePath,
            })),
        });
        try {
            const servedRange = await fetch(new URL("file?mode=preview", server.url), {
                headers: { Range: "bytes=0-3" },
            });
            expect(servedRange.status).toBe(206);
            expect(servedRange.headers.get("Content-Range")).toBe(`bytes 0-3/${content.length}`);
            expect(await servedRange.text()).toBe("%PDF");
        } finally {
            await server.stop(true);
        }
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});
