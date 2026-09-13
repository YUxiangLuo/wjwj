import { runResearchJob, type ResearchJob, type ResearchJobResult } from "./research-job";
import type { WorkerReply } from "@/server/worker-service";
declare const self: Worker;
self.onmessage = async ({ data }: MessageEvent<{ id: number; job: ResearchJob }>) => {
    const result = await runResearchJob(data.job);
    const reply: WorkerReply<ResearchJobResult> = { id: data.id, result: { ok: true, data: result } };
    self.postMessage(reply);
};
