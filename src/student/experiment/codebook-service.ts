import { WorkerService, type ServiceWorker } from "@/server/worker-service";
import { error } from "@/server/http";
import type { CodebookJob, CodebookResult } from "./codebook-job";
export function createCodebookService(createWorker = () => new Worker(new URL("./codebook-worker.ts", import.meta.url).href) as ServiceWorker) {
    return new WorkerService<CodebookJob, CodebookResult>({ createWorker, queueLimit: 2, timeoutMs: 30_000, code: "CODEBOOK", label: "码本导出" });
}
const key = Symbol.for("wj.codebook-service");
const services = globalThis as typeof globalThis & { [key]?: ReturnType<typeof createCodebookService> };
services[key]?.close();
export const codebookService = createCodebookService();
services[key] = codebookService;
export async function codebookDownload(job: CodebookJob, signal?: AbortSignal, authorize?: () => Promise<Response | null | undefined>) {
    const result = await codebookService.run(job, { signal });
    const denied = await authorize?.();
    if (denied) return denied;
    if (!result.ok) return error(result.message, result.code, result.status);
    return new Response(new Uint8Array(result.bytes).buffer, { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="codebook_${job.type}.xlsx"`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
}
