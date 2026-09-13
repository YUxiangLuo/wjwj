import { afterAll, expect, mock, test } from "bun:test";
import { researchFixture } from "@/test-utils/research-analysis";
import { createMockDb } from "@/test-utils/mock-db";
import { dictionaryDatasetRevision } from "@/server/variable-dictionary";
import { describeVariable } from "@/domain/statistics/descriptive";
import { createSeededRandom, performSimpleSamplingWithIndices, performSystematicSampling } from "@/domain/statistics/sampling";
import { researchHash, researchSourceFingerprint } from "./research-source";
import { parseResearchReferences, parseResearchSpec } from "@/domain/experiment/research-analysis";
let current = createMockDb();
mock.module("@/db", () => ({ db: new Proxy({}, { get: (_, key) => (current.db as any)[key] }) }));
const dir = `/tmp/wj-research-reference-${crypto.randomUUID()}`;
mock.module("@/server/storage-files", () => ({ resolveStoragePath: (path: string) => `${dir}/${path}` }));
const { collectResearchReferences, readResearchRun, readResearchAppendix, isResearchRunCurrent } = await import("./research-records");
const { submitStudentExperiment } = await import("./submit-service");
const { buildStageCompletionUpdates, buildStageReopenUpdates } = await import("./update-service");
const bytes = new TextEncoder().encode("编号, 等待分钟 \n01,10\n02,20\n"), mapping = { identifier: "编号", numeric: [" 等待分钟 "] };
await Bun.write(`${dir}/data.csv`, bytes);
afterAll(async () => { await Bun.$`rm -rf ${dir}`.quiet(); });
function fixture() {
    const f = researchFixture(); f.dictionary.datasetRevision = dictionaryDatasetRevision(bytes.buffer, "data.csv", mapping);
    f.run.result = describeVariable(f.run.variable, [10, 20], null);
    f.run.source.datasetRevision = f.dictionary.datasetRevision; f.run.source.populationSize = 2;
    f.run.source.populationFileSha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const at = new Date("2026-01-01T00:00:00.000Z");
    const population = [{ "编号": "01", " 等待分钟 ": 10 }, { "编号": "02", " 等待分钟 ": 20 }];
    const { data: _simpleRows, ...simple } = performSimpleSamplingWithIndices(population, 2, createSeededRandom(1));
    const { data: _systematicRows, ...systematic } = performSystematicSampling(population, 2, createSeededRandom(1));
    const record = { id: 9, taskId: 3, studentId: 2, version: 4, status: "in_progress", currentStage: 4, samplingRevision: 3, analysisReferences: [f.run.id], stage1CompletedAt: at, stage2CompletedAt: at, stage3CompletedAt: at, stage4CompletedAt: at,
        questionnaire: { title: "研究引用验收", welcomeText: "欢迎参加本次认知预试，请认真核对问题表达，试填不会产生真实的总体数据。", endingText: "感谢完成本次认知预试，请明确确认结束，所有试填只用于检查问卷表达。", questions: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, type: "boolean", content: "是否理解本次认知预试？" })) },
        samplePlan: { estimationType: "mean", populationVariance: 25, confidenceLevel: "95", marginOfError: 5, designEffect: 1, nonResponseRate: 0, recommendedSize: 2, finalSampleSize: 2 }, samplingResults: { simple: { completed: true, sampleCount: 2, seed: 1, ...simple }, systematic: { completed: true, sampleCount: 2, seed: 1, ...systematic } }, reportContent: `<p>${"请依据自己的分析结果解释研究目的、抽样过程以及结果限制。".repeat(10)}</p>` } as any;
    f.run.source.fingerprint = researchSourceFingerprint({ experimentId: 9, taskId: 3, dictionary: f.dictionary, method: "simple", section: record.samplingResults.simple, stage3CompletedAt: at.toISOString(), samplingRevision: record.samplingRevision });
    f.run.source.sampleRevision = researchHash({ section: record.samplingResults.simple, stage3CompletedAt: at.toISOString(), samplingRevision: record.samplingRevision });
    return { ...f, record };
}
test("source fingerprints ignore object key order but preserve typed values, array order, scope and completion generation", () => {
    expect(researchHash({ a: "01", b: [1, false] })).toBe(researchHash({ b: [1, false], a: "01" }));
    expect(researchHash(["1"])).not.toBe(researchHash([1])); expect(researchHash([false])).not.toBe(researchHash([0])); expect(researchHash([1, 2])).not.toBe(researchHash([2, 1]));
    const { record, run, dictionary } = fixture(); expect(isResearchRunCurrent(record, dictionary, run)).toBe(true);
    expect(isResearchRunCurrent({ ...record, id: 10 }, dictionary, run)).toBe(false);
    expect(isResearchRunCurrent({ ...record, samplingRevision: 4 }, dictionary, run)).toBe(false);
    expect(isResearchRunCurrent({ ...record, version: 10, reportContent: "换正文" }, dictionary, run)).toBe(true);
});
test("selection rejects forged data, duplicate references and unsupported schemas, without coercion", () => {
    const { run } = fixture(); expect(parseResearchSpec(run.spec)).toEqual(run.spec);
    for (const spec of [{ ...run.spec, rows: [] }, { ...run.spec, weights: [] }, { ...run.spec, result: { mean: 100 } }, { ...run.spec, schemaVersion: "1" }, { ...run.spec, question: "\ud800" }, { ...run.spec, variableId: "v_02" }]) expect(typeof parseResearchSpec(spec)).toBe("string");
    expect(parseResearchReferences([])).toEqual([]);
    for (const refs of [null, "[]", [run.id, run.id], Array(11).fill(run.id), ["-".repeat(36)]]) expect(typeof parseResearchReferences(refs)).toBe("string");
});
test("immutable documents and snapshot appendices reject corrupted storage instead of skipping records", () => {
    const { run } = fixture(); expect(readResearchRun(run)).toEqual(run); expect(readResearchAppendix(undefined)).toEqual([]);
    for (const bad of [JSON.stringify(run), { ...run, schemaVersion: 2 }, { ...run, injected: [] }, { ...run, result: { ...run.result, sampleSD: Infinity } }, { ...run, source: { ...run.source, samplingRevision: 0 } }, { ...run, spec: { ...run.spec, mode: "design-weighted" } }]) expect(() => readResearchRun(bad)).toThrow();
    for (const bad of [null, "[]", [run, run], [run, null]]) expect(() => readResearchAppendix(bad)).toThrow();
});
test("every reference must exist under this experiment and match the actual source", async () => {
    const { record, run, dictionary } = fixture();
    current = createMockDb({ select: [[{ id: run.id, document: run }]] }); expect(await collectResearchReferences(record, dictionary)).toEqual([run]);
    current = createMockDb({ select: [[]] }); await expect(collectResearchReferences(record, dictionary)).rejects.toMatchObject({ code: "STALE_RESEARCH_REFERENCE" });
    current = createMockDb({ select: [[{ id: run.id, document: run }]] }); await expect(collectResearchReferences({ ...record, samplingRevision: 4 }, dictionary)).rejects.toMatchObject({ code: "STALE_RESEARCH_REFERENCE" });
    expect(current.operations.every(op => op.kind === "select")).toBe(true);
    current = createMockDb(); expect(await collectResearchReferences({ ...record, analysisReferences: [] }, null)).toEqual([]); expect(current.operations).toHaveLength(0);
});
test("normal report save carries only reference IDs; upstream reopening explicitly clears references but not run records", () => {
    const { record } = fixture(); const base = { experimentRecord: record, stage: 4, populationSize: 2, deadlinePassed: false };
    const result = buildStageCompletionUpdates({ ...base, payload: { reportContent: record.reportContent, analysisReferences: record.analysisReferences } });
    expect(result.ok && result.updates).toMatchObject({ analysisReferences: record.analysisReferences, version: 5 });
    expect(buildStageCompletionUpdates({ ...base, payload: { reportContent: record.reportContent, analysisRuns: [{ fabricated: true }] } }).ok).toBe(false);
    for (const stage of [1, 2, 3]) { const reopened = buildStageReopenUpdates({ experimentRecord: record, stage, deadlinePassed: false }); expect(reopened.ok && reopened.updates.analysisReferences).toEqual([]); }
    const report = buildStageReopenUpdates({ experimentRecord: record, stage: 4, deadlinePassed: false }); expect(report.ok && report.updates).not.toHaveProperty("analysisReferences");
    const sampled = buildStageCompletionUpdates({ experimentRecord: { ...record, currentStage: 3, version: 8, stage3CompletedAt: null, stage4CompletedAt: null }, stage: 3, payload: {}, populationSize: 2, deadlinePassed: false });
    expect(sampled.ok && sampled.updates.samplingRevision).toBe(9);
});
test("final submission freezes exactly selected server records without changing their inputs or results", async () => {
    const { record, run, dictionary } = fixture(); current = createMockDb({ select: [[{ id: run.id, document: run }]], update: [[{ id: record.id }]] });
    const result = await submitStudentExperiment({ experimentRecord: record, observedVersion: 4, student: { studentId: "01" }, taskInfo: { topicName: "研究引用", populationSize: 2, variableDictionary: dictionary, variableDictionaryRevision: 1, excelFilePath: "data.csv", fieldMapping: mapping } });
    expect(result).toMatchObject({ ok: true });
    const update = current.operations.find(op => op.kind === "update")!.set as any;
    expect(update.submissionSnapshot.analysisRuns).toEqual([run]); expect(update.submissionSnapshot.reportContent).toBe(record.reportContent);
    expect(update).toMatchObject({ version: 5, status: "submitted" }); expect(current.operations.some(op => op.kind === "insert")).toBe(false);
});
