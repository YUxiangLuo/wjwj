import { expect, test } from "bun:test";
import { UnivariateService } from "./univariate-service";
import type { UnivariateJob } from "./univariate-job";
import type { UnivariateData } from "./univariate-service";
import type { WorkerReply } from "../../server/worker-service";

// docs/VARIABLE_ANALYSIS_TEST_PLAN.md §8 Worker 到持久化的失败链路（P1）。
const job = (index: number): UnivariateJob => ({
    populationPath: "unused",
    fieldMapping: { index },
    dictionary: { source: "test", revision: 1, variables: [] },
    config: { question: "这个变量的平均水平是多少？", method: "simple", field: "value", weighted: false },
    samplingResult: { completed: true, serverGenerated: true, sampleCount: 1, seed: 1, indices: [0] },
});
const data: UnivariateData = { result: { kind: "numeric", weighted: false, sampleCount: 1, validCount: 1, missingCount: 0, mean: 1, sampleStandardDeviation: null, min: 1, max: 1, q1: 1, median: 1, q3: 1 }, evidence: {}, algorithmVersion: "test" };

class FakeWorker {
    onmessage: ((event: MessageEvent<WorkerReply<UnivariateData>>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    closeListener: (() => void) | null = null;
    sent: Array<{ id: number; job: UnivariateJob }> = [];
    terminated = false;
    postMessage(message: { id: number; job: UnivariateJob }) { this.sent.push(message); }
    terminate() { this.terminated = true; }
    ref() {}
    unref() {}
    addEventListener(_type: string, listener: () => void) { this.closeListener = listener; }
    succeed(index = this.sent.length - 1) {
        this.onmessage?.({ data: { id: this.sent[index]!.id, result: { ok: true, data } } } as MessageEvent<WorkerReply<UnivariateData>>);
    }
}

function harness(options: { queueLimit?: number; timeoutMs?: number } = {}) {
    const workers: FakeWorker[] = [];
    const service = new UnivariateService({ ...options, createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker as unknown as Worker & { ref(): void; unref(): void };
    } });
    return { workers, service };
}

test("univariate admission runs one job at a time and rejects the 18th job without dropping queued work", async () => {
    const { workers, service } = harness();
    try {
        // 1 个运行中 + 队列上限 16 个
        const accepted = Array.from({ length: 17 }, (_, index) => service.run(job(index)).catch(cause => cause));
        await expect(service.run(job(99))).rejects.toMatchObject({ code: "UNIVARIATE_BUSY", status: 503 });
        expect(workers).toHaveLength(1);
        expect(workers[0]!.sent).toHaveLength(1);
        expect(workers[0]!.sent[0]!.job.fieldMapping).toEqual({ index: 0 });

        // 完成一个后按 FIFO 调度下一个，全部 17 个最终成功
        for (let index = 0; index < 17; index += 1) {
            workers[0]!.succeed();
            await Bun.sleep(0);
        }
        const results = await Promise.all(accepted);
        expect(results.every(result => result === data)).toBe(true);
        expect(workers[0]!.sent.map(message => (message.job.fieldMapping as { index: number }).index)).toEqual(Array.from({ length: 17 }, (_, index) => index));
        // 队列排空后恢复接收新任务
        const recovered = service.run(job(100));
        workers[0]!.succeed();
        expect(await recovered).toEqual(data);
    } finally { service.close(); }
});

test("a crashed worker rejects active work and continues queued work on a replacement", async () => {
    const { workers, service } = harness();
    try {
        const active = service.run(job(0)).catch(cause => cause);
        const queued = service.run(job(1));
        workers[0]!.closeListener?.();
        expect(await active).toMatchObject({ code: "UNIVARIATE_FAILED", status: 503 });
        expect(workers).toHaveLength(2);
        expect(workers[1]!.sent).toHaveLength(1);
        workers[1]!.succeed();
        expect(await queued).toEqual(data);
    } finally { service.close(); }
});

test("cancelling abandoned callers removes queued work instead of leaking it", async () => {
    const { workers, service } = harness({ queueLimit: 4 });
    try {
        const active = service.run(job(0)).catch(cause => cause);
        const abandoned = [new AbortController(), new AbortController()];
        const cancelled = abandoned.map((controller, index) => service.run(job(index + 1), { key: `abandoned-${index}`, signal: controller.signal }).catch(cause => cause));
        abandoned.forEach(controller => controller.abort());
        for (const result of await Promise.all(cancelled)) expect(result).toMatchObject({ name: "AbortError" });
        const replacement = service.run(job(9));
        workers[0]!.succeed(); // active(0) settles, next must be replacement, not the abandoned keys
        await active;
        expect(workers[0]!.sent.map(message => (message.job.fieldMapping as { index: number }).index)).toEqual([0, 9]);
        workers[0]!.succeed();
        expect(await replacement).toEqual(data);
    } finally { service.close(); }
});

test("shutdown and timeout reject queued callers with clear codes", async () => {
    const { service } = harness({ timeoutMs: 20 });
    await expect(service.run(job(0))).rejects.toMatchObject({ code: "UNIVARIATE_TIMEOUT", status: 503 });
    const queued = service.run(job(1)).catch(cause => cause);
    service.close();
    expect(await queued).toMatchObject({ code: "UNIVARIATE_CLOSED", status: 503 });
    await expect(service.run(job(2))).rejects.toMatchObject({ code: "UNIVARIATE_CLOSED" });
});
