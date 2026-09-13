import { afterEach, expect, spyOn, test } from "bun:test";
import { codebookDownload, codebookService, createCodebookService } from "./codebook-service";
import type { ServiceWorker } from "@/server/worker-service";
const job = { type: "all" } as any;
let restore = () => {};
afterEach(() => restore());
test("codebook responses are no-store XLSX attachments with exact bytes", async () => {
    const spy = spyOn(codebookService, "run").mockResolvedValue({ ok: true, bytes: new Uint8Array([80, 75, 3, 4]) }); restore = () => spy.mockRestore();
    const response = await codebookDownload(job);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(response.headers.get("content-disposition")).toContain("codebook_all.xlsx");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([80,75,3,4]);
});
test("access revoked while the worker runs prevents publication of the generated file", async () => {
    const spy = spyOn(codebookService, "run").mockResolvedValue({ ok: true, bytes: new Uint8Array([80, 75]) }); restore = () => spy.mockRestore();
    const response = await codebookDownload(job, undefined, async () => Response.json({ denied: true }, { status: 403 }));
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ denied: true });
});
test("worker validation failures keep their actionable JSON status, never a fake XLSX", async () => {
    const spy = spyOn(codebookService, "run").mockResolvedValue({ ok: false, code: "NO_DICTIONARY", message: "请教师先确认变量字典", status: 409 }); restore = () => spy.mockRestore();
    const response = await codebookDownload(job); expect(response.status).toBe(409);
    expect((await response.json() as any).error.code).toBe("NO_DICTIONARY");
});
test("codebook generation has one active worker and at most two queued exports", async () => {
    const worker = { onmessage: null as any, onerror: null as any, postMessage() {}, addEventListener() {}, ref() {}, unref() {}, terminate() {} };
    const service = createCodebookService(() => worker as unknown as ServiceWorker);
    try {
        const active = service.run(job).catch(e => e), a = service.run(job).catch(e => e), b = service.run(job).catch(e => e);
        await expect(service.run(job)).rejects.toMatchObject({ code: "CODEBOOK_BUSY" });
        service.close(); expect((await active).code).toBe("CODEBOOK_CLOSED"); await a; await b;
    } finally { service.close(); }
});
