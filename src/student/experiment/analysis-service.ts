import type { AnalysisMetricsResult } from "./analysis-metrics";
import type { AnalysisJob } from "./analysis-job";
import { WorkerService, queueLimitFromEnv, type ServiceWorker } from "../../server/worker-service";
export { WorkerServiceError as AnalysisServiceError } from "../../server/worker-service";
export type AnalysisWorker = ServiceWorker;

export const ANALYSIS_QUEUE_LIMIT = 64;
export const ANALYSIS_TIMEOUT_MS = 30_000;

export class AnalysisService extends WorkerService<AnalysisJob, AnalysisMetricsResult> {
    constructor(options: { createWorker?: () => AnalysisWorker; queueLimit?: number; timeoutMs?: number } = {}) {
        super({
            createWorker: options.createWorker ?? (() => new Worker(new URL("./analysis-worker.ts", import.meta.url).href) as AnalysisWorker),
            queueLimit: options.queueLimit ?? queueLimitFromEnv(process.env.ANALYSIS_QUEUE_LIMIT, ANALYSIS_QUEUE_LIMIT),
            timeoutMs: options.timeoutMs ?? ANALYSIS_TIMEOUT_MS,
            code: "ANALYSIS", label: "分析",
        });
    }
}

// Bun --hot has no dispose hook. Retire the previous singleton on reload.
const serviceKey = Symbol.for("wj.analysis-service");
const services = globalThis as typeof globalThis & { [serviceKey]?: AnalysisService };
services[serviceKey]?.close();
export const analysisService = new AnalysisService();
services[serviceKey] = analysisService;
