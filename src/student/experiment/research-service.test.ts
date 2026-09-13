import { afterAll, expect, mock, test } from "bun:test";
import { createMockDb } from "@/test-utils/mock-db";
import { researchAnalysisRun } from "@/db/schema";
import { dictionaryDatasetRevision } from "@/server/variable-dictionary";
import { describeVariable } from "@/domain/statistics/descriptive";
import { createSeededRandom, performSimpleSamplingWithIndices } from "@/domain/statistics/sampling";
import { researchHash, researchSourceFingerprint } from "./research-source";
import type { VariableDictionaryV1 } from "@/domain/experiment/variable-dictionary";
import type { ResearchSpec, ResearchRun } from "@/domain/experiment/research-analysis";
let current = createMockDb();
mock.module("@/db", () => ({ db: new Proxy({}, { get: (_, key) => (current.db as any)[key] }) }));
const dir = `/tmp/wj-research-service-${crypto.randomUUID()}`;
mock.module("@/server/storage-files", () => ({ resolveStoragePath: (path: string) => `${dir}/${path}` }));
const { saveResearchRun, listResearchRuns, createResearchWorkerService } = await import("./research-service");
const spec: ResearchSpec = { schemaVersion: 1, method: "simple", variableId: "v_2", question: "数值均值是多少？", mode: "raw" };
const mapping = { identifier: "id", numeric: ["x"] }, bytes = new TextEncoder().encode("id,x\n01,1\n02,2\n");
const sha = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const dictionary: VariableDictionaryV1 = { schemaVersion: 1, revision: 1, parserVersion: "spreadsheet-v2", datasetRevision: dictionaryDatasetRevision(bytes.buffer, "data.csv", mapping), variables: [
    { id: "v_1", sourceField: "id", label: "ID", storageType: "text", measurementLevel: "id", unit: "", categories: [], missingValues: [] },
    { id: "v_2", sourceField: "x", label: "数值", storageType: "number", measurementLevel: "continuous", unit: "", categories: [], missingValues: [] },
] };
await Bun.write(`${dir}/data.csv`, bytes);
afterAll(async () => { await Bun.$`rm -rf ${dir}`.quiet(); });
const record = { id: 9, studentId: 4, taskId: 3, version: 7, status: "in_progress", currentStage: 4, samplingRevision: 1, stage3CompletedAt: new Date("2026-09-14T00:00:00.000Z"), samplingResults: { simple: { completed: true, indices: [0, 1], sampleCount: 2, seed: 1 } }, analysisReferences: [] };
const context = { record, classId: 1, deadline: null, openTime: null, variableDictionary: dictionary, variableDictionaryRevision: 1, excelFilePath: "data.csv", fieldMapping: mapping, populationSize: 2 };
const fingerprint = researchSourceFingerprint({ experimentId: 9, taskId: 3, dictionary, method: "simple", section: record.samplingResults.simple, stage3CompletedAt: record.stage3CompletedAt.toISOString(), samplingRevision: record.samplingRevision });
const document: ResearchRun = { id: "12345678-1234-4234-8234-123456789abc", schemaVersion: 1, algorithmVersion: "descriptive-v1", createdAt: "2026-09-14T00:00:00.000Z", spec, variable: dictionary.variables[1]!, source: { fingerprint, datasetRevision: dictionary.datasetRevision, dictionaryRevision: 1, populationFileSha256: sha, populationSize: 2, sampleRevision: researchHash({ section: record.samplingResults.simple, stage3CompletedAt: record.stage3CompletedAt.toISOString(), samplingRevision: record.samplingRevision }), samplingRevision: record.samplingRevision, parserVersion: "spreadsheet-v2", samplingAlgorithmVersion: "sampling-v2" }, result: describeVariable(dictionary.variables[1]!, [1, 2], null) };
const requestKey = `r_${"a".repeat(32)}`;
const prior = { id: document.id, requestKey, inputVersion: 7, specHash: researchHash(spec), document };
const params = () => ({ studentId: 4, taskId: 3, observedVersion: 7, requestKey, spec, authorize: mock(async () => {}) });
const worker = () => ({ run: mock(async () => ({ ok: true as const, run: structuredClone(document) })) });
test("save locks current ownership/source, inserts one immutable result and never changes report or experiment version", async () => {
    current = createMockDb({ select: [[context], [], [context], []] }); const p = params(), w = worker();
    const saved = await saveResearchRun(p, w);
    expect(saved.replayed).toBe(false); expect(saved.run.id).not.toBe(document.id); expect(p.authorize).toHaveBeenCalledTimes(1);
    expect(current.operations.filter(o => o.kind === "update")).toHaveLength(0);
    expect(current.operations.some(o => o.lockStrength === "update")).toBe(true);
    const insert = current.operations.find(o => o.kind === "insert")!;
    expect(insert.table).toBe(researchAnalysisRun); expect(insert.values).toMatchObject({ experimentId: 9, requestKey, inputVersion: 7, document: saved.run });
});
test("lost-response retry returns the same record without another computation or write", async () => {
    current = createMockDb({ select: [[context], [prior]] }); const w = worker();
    const result = await saveResearchRun(params(), w);
    expect(result).toEqual({ run: document, replayed: true }); expect(w.run).not.toHaveBeenCalled(); expect(current.operations.some(o => o.kind === "insert")).toBe(false);
});
test("same request key with changed spec or observed version is a conflict", async () => {
    for (const p of [{ ...params(), spec: { ...spec, question: "别的问题" } }, { ...params(), observedVersion: 8 }]) {
        current = createMockDb({ select: [[context], [prior]] }); await expect(saveResearchRun(p, worker())).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
        expect(current.operations.some(o => o.kind === "insert")).toBe(false);
    }
});
test("another identical request winning the row lock is replayed, not duplicated", async () => {
    current = createMockDb({ select: [[context], [], [context], [prior]] });
    expect((await saveResearchRun(params(), worker())).replayed).toBe(true); expect(current.operations.some(o => o.kind === "insert")).toBe(false);
});
for (const state of ["version", "submitted", "reopened", "deadline", "ownership", "source", "same-clock-recompletion", "cancelled", "auth", "wrong-worker-spec"] as const) test(`late computation is not persisted after ${state}`, async () => {
    const fresh = structuredClone(context), p = params(), w = worker();
    if (state === "version") fresh.record.version++;
    if (state === "submitted") fresh.record.status = "submitted";
    if (state === "reopened") fresh.record.currentStage = 3;
    if (state === "deadline") (fresh as any).deadline = new Date(0);
    if (state === "source") fresh.record.samplingResults.simple.indices.reverse();
    if (state === "same-clock-recompletion") fresh.record.samplingRevision++;
    if (state === "cancelled") { const abort = new AbortController(); abort.abort(); (p as any).signal = abort.signal; }
    if (state === "auth") p.authorize.mockImplementation(async () => { throw new Error("revoked"); });
    if (state === "wrong-worker-spec") w.run.mockImplementation(async () => ({ ok: true, run: { ...document, spec: { ...spec, mode: "design-weighted" } } }));
    current = createMockDb({ select: [[context], [], state === "ownership" ? [] : [fresh], []] });
    await expect(saveResearchRun(p, w)).rejects.toThrow();
    expect(current.operations.some(o => o.kind === "insert")).toBe(false);
});
test("capacity and stage guards run before queuing expensive work", async () => {
    for (const [ctx, rows] of [[context, Array.from({ length: 30 }, (_, i) => ({ ...prior, requestKey: `other${i}` }))], [{ ...context, record: { ...record, version: 8 } }, []]] as const) {
        current = createMockDb({ select: [[ctx], rows] }); const w = worker();
        await expect(saveResearchRun(params(), w)).rejects.toThrow(); expect(w.run).not.toHaveBeenCalled();
    }
});
test("read receipts recheck membership and authentication after source I/O", async () => {
    const authorize = mock(async () => {});
    current = createMockDb({ select: [[context], [prior], []] });
    await expect(listResearchRuns(4, 3, authorize)).rejects.toMatchObject({ code: "NOT_FOUND" });
    current = createMockDb({ select: [[context], [prior], [context]] });
    authorize.mockImplementation(async () => { throw new Error("session revoked"); });
    await expect(listResearchRuns(4, 3, authorize)).rejects.toThrow("session revoked");
    current = createMockDb({ select: [[context], [prior], [{ ...context, record: { ...record, version: 8 } }]] });
    const read = await listResearchRuns(4, 3, async () => {});
    expect(read.runs[0]!.current).toBe(false); expect(read.sourceError).toContain("核对期间"); expect(read.runs[0]!.run).toEqual(document);
    expect(current.operations.some(op => op.kind === "insert" || op.kind === "update")).toBe(false);
});
test("oversized complete category results fail explicitly before insertion, never truncate", async () => {
    const ctx = structuredClone(context), d = ctx.variableDictionary;
    const v = d.variables[1]!; v.storageType = "text"; v.measurementLevel = "nominal";
    v.categories = Array.from({ length: 50 }, (_, i) => ({ value: "码".repeat(195) + i, label: "类".repeat(200) }));
    const rows = v.categories.map((c, i) => ({ id: String(i).padStart(3, "0"), x: c.value }));
    const content = new TextEncoder().encode("id,x\n" + rows.map(r => `${r.id},${r.x}`).join("\n"));
    ctx.excelFilePath = "large.csv"; ctx.fieldMapping = { identifier: "id", numeric: [] }; ctx.populationSize = 50;
    await Bun.write(`${dir}/large.csv`, content); d.datasetRevision = dictionaryDatasetRevision(content.buffer, "large.csv", ctx.fieldMapping);
    ctx.record.samplingResults.simple = { completed: true, sampleCount: 50, seed: 1, indices: performSimpleSamplingWithIndices(rows, 50, createSeededRandom(1)).indices };
    const output = structuredClone(document); output.variable = v; output.result = describeVariable(v, rows.map(r => r.x), null); output.source.datasetRevision = d.datasetRevision; output.source.populationSize = 50;
    output.source.populationFileSha256 = new Bun.CryptoHasher("sha256").update(content).digest("hex");
    output.source.sampleRevision = researchHash({ section: ctx.record.samplingResults.simple, stage3CompletedAt: record.stage3CompletedAt.toISOString(), samplingRevision: 1 });
    output.source.fingerprint = researchSourceFingerprint({ experimentId: 9, taskId: 3, dictionary: d, method: "simple", section: ctx.record.samplingResults.simple, stage3CompletedAt: record.stage3CompletedAt.toISOString(), samplingRevision: 1 });
    current = createMockDb({ select: [[ctx], [], [ctx], []] });
    await expect(saveResearchRun(params(), { run: async () => ({ ok: true, run: output }) })).rejects.toMatchObject({ code: "RESEARCH_RESULT_TOO_LARGE", status: 413 });
    expect(current.operations.some(op => op.kind === "insert")).toBe(false); expect(output.result.categories).toHaveLength(50);
});
test("one analysis worker admits no more than two waiting jobs", async () => {
    const w = { onmessage: null, onerror: null, postMessage() {}, addEventListener() {}, ref() {}, unref() {}, terminate() {} };
    const service = createResearchWorkerService(() => w as any);
    const jobs = [1, 2, 3].map(() => service.run({} as any).catch(e => e));
    try { await expect(service.run({} as any)).rejects.toMatchObject({ code: "RESEARCH_BUSY" }); }
    finally { service.close(); await Promise.all(jobs); }
});
