import { runPopulationStatsJob, type PopulationStatsJob, type PopulationStats } from "./population-stats-job";
import type { WorkerReply } from "../../server/worker-service";

declare const self: Worker;
self.onmessage = async ({ data }: MessageEvent<{ id: number; job: PopulationStatsJob }>) => {
    let reply: WorkerReply<PopulationStats>;
    try {
        reply = { id: data.id, result: await runPopulationStatsJob(data.job) };
    } catch (cause) {
        console.error("Population statistics worker failed:", cause);
        reply = { id: data.id, result: { ok: false, code: "STATS_FAILED", message: "总体统计计算失败，请重试" } };
    }
    self.postMessage(reply);
};
