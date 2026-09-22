import { resolveStoragePath } from "../../server/storage-files";
import { WorkerService, WorkerServiceError, queueLimitFromEnv, type ServiceWorker } from "../../server/worker-service";
import type { PopulationStatsJob, PopulationStats } from "./population-stats-job";

/** Include mapping and file revision; replacement or deletion must miss cache. */
export function populationRevisionKey(job: PopulationStatsJob) {
    try {
        const path = resolveStoragePath(job.populationPath);
        const file = Bun.file(path);
        return JSON.stringify([
            path,
            file.size,
            file.lastModified,
            job.fieldMapping,
            job.ppsSampleSize ?? null,
            job.ppsSizeFields ?? null,
        ]);
    } catch {
        throw new WorkerServiceError("READ_FAILED", "总体数据为空或读取失败", 500);
    }
}

export class PopulationStatsService {
    private readonly worker: WorkerService<PopulationStatsJob, PopulationStats>;
    private readonly cache = new Map<string, { data: PopulationStats; bytes: number }>();
    private cacheBytes = 0;
    private closed = false;

    constructor(options: { createWorker?: () => ServiceWorker; queueLimit?: number; timeoutMs?: number } = {}) {
        this.worker = new WorkerService({
            createWorker: options.createWorker ?? (() => new Worker(new URL("./population-stats-worker.ts", import.meta.url).href) as ServiceWorker),
            queueLimit: options.queueLimit ?? queueLimitFromEnv(process.env.POPULATION_STATS_QUEUE_LIMIT, 64),
            timeoutMs: options.timeoutMs ?? 30_000,
            code: "STATS", label: "总体统计",
        });
    }

    async run(job: PopulationStatsJob, signal?: AbortSignal): Promise<PopulationStats> {
        signal?.throwIfAborted();
        if (this.closed) throw new WorkerServiceError("STATS_CLOSED", "总体统计服务正在停止，请稍后重试");
        const key = populationRevisionKey(job);
        const hit = this.cache.get(key);
        if (hit) {
            this.cache.delete(key);
            this.cache.set(key, hit);
            return hit.data;
        }
        const data = await this.worker.run(job, { key, signal });
        // All subscribers resume here; retain/size shared results only once.
        if (!this.closed && !this.cache.has(key) && key === populationRevisionKey(job)) {
            const bytes = JSON.stringify(data).length * 4;
            const budget = 16 * 1024 * 1024;
            if (bytes <= budget) {
                this.cache.set(key, { data, bytes });
                this.cacheBytes += bytes;
                while (this.cache.size > 8 || this.cacheBytes > budget) {
                    const oldest = this.cache.keys().next().value!;
                    this.cacheBytes -= this.cache.get(oldest)!.bytes;
                    this.cache.delete(oldest);
                }
            }
        }
        return data;
    }

    close() { this.closed = true; this.worker.close(); this.cache.clear(); this.cacheBytes = 0; }
}

const serviceKey = Symbol.for("wj.population-stats-service");
const services = globalThis as typeof globalThis & { [serviceKey]?: PopulationStatsService };
services[serviceKey]?.close();
export const populationStatsService = new PopulationStatsService();
services[serviceKey] = populationStatsService;
