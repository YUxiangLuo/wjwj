import { WorkerService, type ServiceWorker } from "../../server/worker-service";
import type { UnivariateJob } from "./univariate-job";
import type { AnalysisResult } from "../../domain/variables/types";

export interface UnivariateData { result: AnalysisResult; evidence: Record<string, unknown>; algorithmVersion: string }
export class UnivariateService extends WorkerService<UnivariateJob, UnivariateData> {
    constructor(options: { createWorker?: () => ServiceWorker; queueLimit?: number; timeoutMs?: number } = {}) {
        super({ createWorker: options.createWorker ?? (() => new Worker(new URL("./univariate-worker.ts", import.meta.url).href) as ServiceWorker),
            queueLimit: options.queueLimit ?? 16, timeoutMs: options.timeoutMs ?? 30_000, code: "UNIVARIATE", label: "单变量分析" });
    }
}
const serviceKey = Symbol.for("wj.univariate-service");
const services = globalThis as typeof globalThis & { [serviceKey]?: UnivariateService };
services[serviceKey]?.close();
export const univariateService = new UnivariateService();
services[serviceKey] = univariateService;
