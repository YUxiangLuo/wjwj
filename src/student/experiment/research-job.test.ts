import { afterAll, expect, mock, test } from "bun:test";
import { parseSpreadsheetFile } from "@/lib/spreadsheet";
import { suggestVariableDictionary } from "@/domain/experiment/variable-dictionary";
import { dictionaryDatasetRevision } from "@/server/variable-dictionary";
import { executeSamplingAction } from "./sampling-service";
import type { ResearchJob } from "./research-job";
const dir = `/tmp/wj-research-job-${crypto.randomUUID()}`;
mock.module("@/server/storage-files", () => ({ resolveStoragePath: (path: string) => `${dir}/${path}` }));
const { runResearchJob } = await import("./research-job");
afterAll(async () => { await Bun.$`rm -rf ${dir}`.quiet(); });
async function fixture(): Promise<ResearchJob> {
    const filename = `${crypto.randomUUID()}.csv`, text = '\uFEFF编号, x ,规模,分组\n001,10,2,A\n002,20,3,B\n003,30,4,A\n004,40,5,B\n';
    await Bun.write(`${dir}/${filename}`, text); const bytes = await Bun.file(`${dir}/${filename}`).arrayBuffer();
    const mapping = { identifier: "编号", numeric: [" x ", "规模"], stratified: ["分组"] };
    const parsed = await parseSpreadsheetFile(bytes, filename, { numericFields: mapping.numeric });
    const dictionary = { ...suggestVariableDictionary({ columns: parsed.columns, rows: parsed.rows, identifier: mapping.identifier, numeric: mapping.numeric, datasetRevision: dictionaryDatasetRevision(bytes, filename, mapping) }), revision: 1 };
    const sample = await executeSamplingAction({ method: "simple", rawParams: { sampleSize: 4, seed: -5 }, targetSampleSize: 4, population: parsed.rows, fieldMapping: mapping });
    if (!sample.ok) throw new Error(sample.errorMessage); const { data, ...stored } = sample.result;
    return { spec: { schemaVersion: 1, method: "simple", variableId: "v_2", question: "等待时长分布如何？", mode: "raw" }, samplingRevision: 1, stage3CompletedAt: "2026-09-14T00:00:00.000Z", source: {
        experimentId: 5, taskId: 3, version: 4, status: "in_progress", populationSize: 4, excelFilePath: filename, fieldMapping: mapping, variableDictionary: dictionary, variableDictionaryRevision: 1, submissionSnapshot: null, type: "simple", samplingResults: { simple: stored },
        questionnaire: { title: "自主分析验收", welcomeText: "欢迎参加本次认知试填，请核对问卷表达；试填答案不用于采集总体数据。", endingText: "感谢完成本次认知试填，请核对所有题目后明确确认结束，不将试填作为真实采集。", questions: [
            { id: "n", type: "numeric", content: "试填值是多少？", numberRule: { unit: "", min: 0, max: 2, decimalPlaces: 1 } },
            ...Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, type: "boolean", content: "是否理解认知试填？" })),
        ] },
    } };
}
test("actual variable/source/indices produce a saved-ready result, never constrained by cognitive rules", async () => {
    const job = await fixture(), result = await runResearchJob(job);
    expect(result).toMatchObject({ ok: true }); if (!result.ok) return;
    expect(result.run.variable.sourceField).toBe(" x "); expect(result.run.result).toMatchObject({ sampleCount: 4, mean: 25, min: 10, max: 40 });
    expect(result.run.source).toMatchObject({ dictionaryRevision: 1, populationSize: 4, parserVersion: "spreadsheet-v2" });
    expect(JSON.stringify(result)).not.toContain("indices");
    const next = await runResearchJob({ ...job, source: { ...job.source, version: 7 } });
    expect(next.ok && next.run.source.fingerprint).toBe(result.run.source.fingerprint);
    const resampled = await runResearchJob({ ...job, samplingRevision: 2 });
    expect(resampled.ok && resampled.run.source.fingerprint).not.toBe(result.run.source.fingerprint);
});
test("rejected analysis uses explicitly reopened live source, not old submission values", async () => {
    const job = await fixture(); job.source.status = "rejected"; job.source.submissionSnapshot = { questionnaire: null, samplingResults: { invented: 100 } };
    expect((await runResearchJob(job)).ok).toBe(true);
});
for (const scenario of ["file", "dictionary", "unknown-variable", "indices", "client-results", "submitted", "string-sampling"] as const) test(`source fail-closed: ${scenario}`, async () => {
    const job = await fixture();
    if (scenario === "file") await Bun.write(`${dir}/${job.source.excelFilePath}`, 'different source');
    if (scenario === "dictionary") job.source.variableDictionaryRevision = 3;
    if (scenario === "unknown-variable") job.spec.variableId = "v_99";
    if (scenario === "indices") (job.source.samplingResults as any).simple.indices.reverse();
    if (scenario === "client-results") (job.spec as any).results = { mean: 900 };
    if (scenario === "submitted") job.source.status = "submitted";
    if (scenario === "string-sampling") job.source.samplingResults = JSON.stringify(job.source.samplingResults);
    expect((await runResearchJob(job)).ok).toBe(false);
});
test("weighted estimation rejects declared population missing values rather than redefining N", async () => {
    const job = await fixture(); (job.source.variableDictionary as any).variables[1].missingValues = [10]; job.spec.mode = "design-weighted";
    expect(await runResearchJob(job)).toMatchObject({ ok: false, code: "INVALID_RESEARCH_ANALYSIS" });
    job.spec.mode = "raw";
    const raw = await runResearchJob(job); expect(raw.ok && raw.run.result).toMatchObject({ sampleCount: 4, validCount: 3, missingCount: 1, mean: 30 });
});
