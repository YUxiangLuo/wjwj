import { runCodebookJob, type CodebookJob, type CodebookResult } from "./codebook-job";
import type { WorkerReply } from "@/server/worker-service";
declare const self: Worker;
self.onmessage = async ({ data }: MessageEvent<{ id: number; job: CodebookJob }>) => {
    const result = await runCodebookJob(data.job);
    const reply: WorkerReply<CodebookResult> = { id: data.id, result: { ok: true, data: result } };
    self.postMessage(reply);
};
