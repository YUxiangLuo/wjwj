export type AnalysisWorker = Worker & { ref(): void; unref(): void };
import type { AnalysisMetricsResult } from "./analysis-metrics";
import type { AnalysisJob, AnalysisWorkerReply } from "./analysis-job";

export const ANALYSIS_QUEUE_LIMIT = 16;
export const ANALYSIS_TIMEOUT_MS = 30_000;

export class AnalysisServiceError extends Error {
    constructor(public readonly code: string, message: string, public readonly status = 503) {
        super(message);
        this.name = "AnalysisServiceError";
    }
}

interface PendingJob {
    id: number;
    job: AnalysisJob;
    resolve: (value: AnalysisMetricsResult) => void;
    reject: (reason: AnalysisServiceError) => void;
    timer: ReturnType<typeof setTimeout>;
}

/** One lazy, persistent worker keeps CPU work off the HTTP thread and caches warm.
 * The deadline includes queue time; neither hung jobs nor queued callers wait forever.
 */
export class AnalysisService {
    private worker: AnalysisWorker | null = null;
    private active: PendingJob | null = null;
    private queue: PendingJob[] = [];
    private nextId = 1;
    private closed = false;
    private readonly createWorker: () => AnalysisWorker;
    private readonly queueLimit: number;
    private readonly timeoutMs: number;

    constructor(options: { createWorker?: () => AnalysisWorker; queueLimit?: number; timeoutMs?: number } = {}) {
        this.createWorker = options.createWorker ?? (() => new Worker(new URL("./analysis-worker.ts", import.meta.url).href) as AnalysisWorker);
        this.queueLimit = options.queueLimit ?? ANALYSIS_QUEUE_LIMIT;
        this.timeoutMs = options.timeoutMs ?? ANALYSIS_TIMEOUT_MS;
    }

    run(job: AnalysisJob): Promise<AnalysisMetricsResult> {
        if (this.closed) return Promise.reject(new AnalysisServiceError("ANALYSIS_CLOSED", "分析服务正在停止，请稍后重试"));
        if (this.active && this.queue.length >= this.queueLimit) {
            return Promise.reject(new AnalysisServiceError("ANALYSIS_BUSY", "分析任务较多，请稍后重试"));
        }
        return new Promise((resolve, reject) => {
            const pending: PendingJob = {
                id: this.nextId++, job, resolve, reject,
                timer: setTimeout(() => this.expire(pending), this.timeoutMs),
            };
            this.queue.push(pending);
            this.dispatch();
        });
    }

    close() {
        this.closed = true;
        this.retireWorker();
        const jobs = this.active ? [this.active, ...this.queue] : this.queue;
        this.active = null;
        this.queue = [];
        for (const job of jobs) {
            clearTimeout(job.timer);
            job.reject(new AnalysisServiceError("ANALYSIS_CLOSED", "分析服务正在停止，请稍后重试"));
        }
    }

    private retireWorker() {
        const worker = this.worker;
        this.worker = null;
        worker?.terminate();
    }

    private expire(job: PendingJob) {
        if (this.active === job) {
            this.retireWorker();
            this.active = null;
        } else {
            this.queue = this.queue.filter((pending) => pending !== job);
        }
        job.reject(new AnalysisServiceError("ANALYSIS_TIMEOUT", "分析等待或计算超时，请稍后重试"));
        this.dispatch();
    }

    private workerFailed(worker: AnalysisWorker) {
        if (this.worker !== worker) return;
        this.retireWorker();
        if (this.active) {
            clearTimeout(this.active.timer);
            this.active.reject(new AnalysisServiceError("ANALYSIS_FAILED", "分析计算中断，请重试"));
            this.active = null;
        }
        this.dispatch();
    }

    private dispatch() {
        if (this.closed || this.active) return;
        const pending = this.queue.shift();
        if (!pending) {
            this.worker?.unref();
            return;
        }
        this.active = pending;
        try {
            if (!this.worker) {
                const worker = this.createWorker();
                this.worker = worker;
                worker.onmessage = ({ data }: MessageEvent<AnalysisWorkerReply>) => {
                    if (this.worker !== worker || data.id !== this.active?.id) return;
                    const current = this.active;
                    this.active = null;
                    clearTimeout(current.timer);
                    if (data.result.ok) current.resolve(data.result.data);
                    else current.reject(new AnalysisServiceError(data.result.code, data.result.message, 500));
                    this.dispatch();
                };
                worker.onerror = (event) => {
                    event.preventDefault();
                    this.workerFailed(worker);
                };
                worker.addEventListener("close", () => this.workerFailed(worker));
            }
            this.worker.ref();
            this.worker.postMessage({ id: pending.id, job: pending.job });
        } catch {
            this.retireWorker();
            this.active = null;
            clearTimeout(pending.timer);
            pending.reject(new AnalysisServiceError("ANALYSIS_FAILED", "无法启动分析计算，请重试"));
            this.dispatch();
        }
    }
}

// Bun --hot re-evaluates modules without a dispose hook. Retire the previous
// singleton so editing server code cannot accumulate idle worker threads.
const serviceKey = Symbol.for("wj.analysis-service");
const services = globalThis as typeof globalThis & { [serviceKey]?: AnalysisService };
services[serviceKey]?.close();
export const analysisService = new AnalysisService();
services[serviceKey] = analysisService;
