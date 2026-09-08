import { expect, test } from "bun:test";
import { AnalysisService, type AnalysisWorker } from "./analysis-service";
import { runAnalysisJob, type AnalysisJob, type AnalysisWorkerReply, type AnalysisWorkerRequest } from "./analysis-job";
import type { AnalysisMetricsResult } from "./analysis-metrics";
import { createSeededRandom, performPPSSampling, performSimpleSamplingWithIndices, performSystematicSampling } from "../sampling";
import { compactSamplingResults } from "./sampling-storage";

const emptyResult = { numericFields: [] } as unknown as AnalysisMetricsResult;
const emptyJob: AnalysisJob = { populationPath: "unused", fieldMapping: null, samplingResults: null, samplePlan: null };

class FakeWorker {
    onmessage: ((event: MessageEvent<AnalysisWorkerReply>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    closeListener: (() => void) | null = null;
    sent: AnalysisWorkerRequest[] = [];
    terminated = false;
    postMessage(message: AnalysisWorkerRequest) { this.sent.push(message); }
    terminate() { this.terminated = true; }
    ref() {}
    unref() {}
    addEventListener(_type: string, listener: () => void) { this.closeListener = listener; }
    succeed(index = 0) {
        this.onmessage?.({ data: { id: this.sent[index]!.id, result: { ok: true, data: emptyResult } } } as MessageEvent<AnalysisWorkerReply>);
    }
}

function harness(options: { queueLimit?: number; timeoutMs?: number } = {}) {
    const workers: FakeWorker[] = [];
    const service = new AnalysisService({ ...options, createWorker: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker as unknown as AnalysisWorker;
    } });
    return { workers, service };
}

test("default analysis admission serves all 50 students with one worker", async () => {
    const { workers, service } = harness();
    try {
        const jobs = Array.from({ length: 50 }, () => service.run(emptyJob));
        expect(workers).toHaveLength(1);
        for (let index = 0; index < 50; index += 1) workers[0]!.succeed(index);
        expect(await Promise.all(jobs)).toHaveLength(50);
    } finally { service.close(); }
});

test("shared analysis survives one caller cancelling and removes abandoned queued work", async () => {
    const { workers, service } = harness({ queueLimit: 1 });
    const firstCaller = new AbortController();
    const abandoned = new AbortController();
    try {
        const first = service.run(emptyJob, { key: "active", signal: firstCaller.signal }).catch(error => error);
        const shared = service.run(emptyJob, { key: "active" });
        const queued = service.run(emptyJob, { key: "abandoned", signal: abandoned.signal }).catch(error => error);
        firstCaller.abort();
        abandoned.abort();
        expect(await first).toMatchObject({ name: "AbortError" });
        expect(await queued).toMatchObject({ name: "AbortError" });
        const replacement = service.run(emptyJob, { key: "replacement" });
        expect(workers[0]!.sent).toHaveLength(1);
        workers[0]!.succeed();
        expect(await shared).toEqual(emptyResult);
        expect(workers[0]!.sent).toHaveLength(2);
        workers[0]!.succeed(1);
        expect(await replacement).toEqual(emptyResult);
        // Finished keys cannot retain stale results or callers.
        const newInput = service.run(emptyJob, { key: "active" });
        expect(workers[0]!.sent).toHaveLength(3);
        workers[0]!.succeed(2);
        await newInput;
    } finally { service.close(); }
});

test("expired queued jobs do not start replacement workers after a delayed timer", async () => {
    const { workers, service } = harness({ timeoutMs: 5 });
    try {
        const jobs = [service.run(emptyJob).catch(error => error), service.run(emptyJob).catch(error => error)];
        const until = Date.now() + 15;
        while (Date.now() < until) { /* simulate delayed HTTP timers */ }
        for (const error of await Promise.all(jobs)) expect(error).toMatchObject({ code: "ANALYSIS_TIMEOUT" });
        expect(workers).toHaveLength(1);
    } finally { service.close(); }
});

test("analysis queues are bounded, serialized, and reuse the same worker", async () => {
    const { workers, service } = harness({ queueLimit: 1 });
    try {
        const first = service.run(emptyJob);
        const second = service.run(emptyJob);
        await expect(service.run(emptyJob)).rejects.toMatchObject({ code: "ANALYSIS_BUSY", status: 503 });
        expect(workers).toHaveLength(1);
        expect(workers[0]!.sent).toHaveLength(1);
        workers[0]!.succeed();
        await first;
        expect(workers[0]!.sent).toHaveLength(2);
        workers[0]!.succeed(1);
        await second;
    } finally { service.close(); }
});

test("unexpected worker exit rejects active work and starts queued work on a replacement", async () => {
    const { workers, service } = harness();
    try {
        const first = service.run(emptyJob).catch(cause => cause);
        const second = service.run(emptyJob);
        workers[0]!.closeListener?.();
        expect(await first).toMatchObject({ code: "ANALYSIS_FAILED" });
        expect(workers[0]!.terminated).toBe(true);
        expect(workers).toHaveLength(2);
        workers[0]!.succeed(); // late messages from retired workers cannot settle new work
        expect(workers[1]!.sent).toHaveLength(1);
        workers[1]!.succeed();
        await second;
    } finally { service.close(); }
});

test("timeout clears hung work; shutdown rejects both active and queued callers", async () => {
    const { workers, service } = harness({ timeoutMs: 20 });
    await expect(service.run(emptyJob)).rejects.toMatchObject({ code: "ANALYSIS_TIMEOUT" });
    expect(workers[0]!.terminated).toBe(true);
    const active = service.run(emptyJob).catch(cause => cause);
    const queued = service.run(emptyJob).catch(cause => cause);
    service.close();
    expect(await active).toMatchObject({ code: "ANALYSIS_CLOSED" });
    expect(await queued).toMatchObject({ code: "ANALYSIS_CLOSED" });
    await expect(service.run(emptyJob)).rejects.toMatchObject({ code: "ANALYSIS_CLOSED" });
});

test("real worker preserves analysis results, file invalidation, and storage error codes", async () => {
    const populationPath = `/storage/test-analysis-worker-${crypto.randomUUID()}.csv`;
    const file = Bun.file(`${process.cwd()}${populationPath}`);
    const population = Array.from({ length: 200 }, (_, i) => ({ size: i + 1, score: i % 17 }));
    await Bun.write(file, `size,score\n${population.map(row => `${row.size},${row.score}`).join("\n")}\n`);
    const pps = performPPSSampling(population, "size", 50, createSeededRandom(10));
    const job: AnalysisJob = {
        populationPath,
        fieldMapping: { numeric: ["size", "score"], analysisTarget: { kind: "mean", field: "score" } },
        samplingResults: compactSamplingResults({
            simple: { ...performSimpleSamplingWithIndices(population, 50, createSeededRandom(11)), completed: true, sampleCount: 50 },
            systematic: { ...performSystematicSampling(population, 50, createSeededRandom(12)), completed: true, sampleCount: 50 },
            pps: { ...pps, completed: true, sizeField: "size", sampleCount: 50 },
        }),
        samplePlan: { confidenceLevel: "95", marginOfError: 2, finalSampleSize: 50 },
    };
    const service = new AnalysisService();
    try {
        const expected = await runAnalysisJob(job); 
        expect(expected.ok).toBe(true);
        if (!expected.ok) throw new Error(expected.message);
        expect(await service.run(job)).toEqual(expected.data); 
        expect(await service.run(job)).toEqual(expected.data); 
        await Bun.write(file, `size,score\n${population.map(row => `${row.size},${row.score + 100}`).join("\n")}\n`);
        const changed = await service.run(job); 
        expect(changed.numeric.score!.populationMean).toBeCloseTo(expected.data.numeric.score!.populationMean + 100);
        expect(await service.run({ ...job, samplingResults: { simple: { completed: true, sampleCount: 1, indices: [999999] } } }).catch(cause => cause))
            .toMatchObject({ code: "INVALID_SAMPLING_STORAGE", status: 500 });
        expect(await service.run({ ...job, populationPath: `/storage/missing-${crypto.randomUUID()}.csv` }).catch(cause => cause))
            .toMatchObject({ code: "READ_FAILED", status: 500 });
    } finally {
        service.close();
        await file.delete();
    }
});
