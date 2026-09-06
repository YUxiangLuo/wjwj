import { runAnalysisJob, type AnalysisWorkerRequest, type AnalysisWorkerReply } from "./analysis-job";

declare const self: Worker;

// The parent dispatches one job at a time, so parsing and PPS caches are shared
// across students without concurrent copies of the same population.
self.onmessage = async ({ data }: MessageEvent<AnalysisWorkerRequest>) => {
    let reply: AnalysisWorkerReply;
    try {
        reply = { id: data.id, result: await runAnalysisJob(data.job) };
    } catch (cause) {
        console.error("Analysis worker failed:", cause);
        reply = { id: data.id, result: { ok: false, code: "ANALYSIS_FAILED", message: "分析计算失败，请重试" } };
    }
    self.postMessage(reply);
};
