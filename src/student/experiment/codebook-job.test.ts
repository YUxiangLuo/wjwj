import { afterAll, expect, mock, test } from "bun:test";
import * as XLSX from "xlsx";
import { parseSpreadsheetFile } from "@/lib/spreadsheet";
import { suggestVariableDictionary } from "@/domain/experiment/variable-dictionary";
import { dictionaryDatasetRevision } from "@/server/variable-dictionary";
import { questionBindingSignature } from "@/domain/experiment/question-variable-binding";
import type { CodebookJob } from "./codebook-job";
const dir = `/tmp/wj-codebook-job-${crypto.randomUUID()}`;
mock.module("@/server/storage-files", () => ({ resolveStoragePath: (path: string) => `${dir}/${path}` }));
const { runCodebookJob } = await import("./codebook-job");
afterAll(async () => { await Bun.$`rm -rf ${dir}`.quiet(); });
async function fixture(): Promise<CodebookJob> {
    const excelFilePath = `${crypto.randomUUID()}.csv`, text = '\uFEFF编号,等待分钟, 片区 ,备注\n001,10,东区,=2+2\n002,20,西区,+cmd\n003,30,东区,普通\n004,40,西区,普通\n';
    await Bun.write(`${dir}/${excelFilePath}`, text);
    const bytes = await Bun.file(`${dir}/${excelFilePath}`).arrayBuffer();
    const fieldMapping = { identifier: "编号", numeric: ["等待分钟"], others: [" 片区 ", "备注"] };
    const parsed = await parseSpreadsheetFile(bytes, excelFilePath, { numericFields: fieldMapping.numeric });
    const dictionary = { ...suggestVariableDictionary({ columns: parsed.columns, rows: parsed.rows, identifier: fieldMapping.identifier, numeric: fieldMapping.numeric, datasetRevision: dictionaryDatasetRevision(bytes, excelFilePath, fieldMapping) }), revision: 1 };
    const numeric = { id: "n", type: "numeric" as const, content: "实际等待时长？", numberRule: { unit: "", min: 0, max: 100, decimalPlaces: 2 } };
    const questionnaire = { title: "码本测试", welcomeText: "欢迎参加本次认知预试，回答仅用于检验问卷表达，不写入原始样本。", endingText: "感谢完成本次认知预试，既有数据并不是由本问卷收集，请明确确认结束。", questions: [
        { ...numeric, variableBinding: { schemaVersion: 1, taskId: 3, kind: "continuous", variableId: "v_2", dictionaryRevision: 1, datasetRevision: dictionary.datasetRevision, questionSignature: questionBindingSignature(numeric) } },
        ...Array.from({ length: 4 }, (_, i) => ({ id: `q${i}`, type: "boolean", content: `是否理解第${i + 2}题？` })),
    ] };
    const samplingResults = { simple: { completed: true, seed: 123, sampleCount: 2, indices: [0, 2] } };
    return { experimentId: 5, taskId: 3, version: 4, status: "submitted", populationSize: 4, fieldMapping, excelFilePath, type: "all", questionnaire, samplingResults,
        variableDictionary: dictionary, variableDictionaryRevision: 1, submissionSnapshot: { variableDictionary: dictionary, questionnaire, samplingResults, populationSize: 4, populationFileSha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"), parserVersion: "spreadsheet-v2", samplingAlgorithmVersion: "sampling-v2" } };
}
test("submitted codebook uses its own dictionary, questionnaire and indices, never live replacements", async () => {
    const job = await fixture(); job.variableDictionary = { schemaVersion: 99 }; job.questionnaire = null; job.samplingResults = null;
    const result = await runCodebookJob(job); expect(result.ok).toBe(true); if (!result.ok) return;
    const book = XLSX.read(result.bytes, { type: "buffer" });
    expect(XLSX.utils.sheet_to_json(book.Sheets["样本_simple"]!, { header: 1, raw: true })).toEqual([["编号","等待分钟"," 片区 ","备注"],["001",10,"东区","=2+2"],["003",30,"东区","普通"]]);
    expect(book.Sheets["样本_simple"]!.D2.f).toBeUndefined();
});
test("dictionary/read-type disagreement is rejected instead of converting original sample cells", async () => {
    const job = await fixture(); const dictionary = (job.submissionSnapshot as any).variableDictionary;
    dictionary.variables[2] = { ...dictionary.variables[2], storageType: "number", measurementLevel: "continuous", categories: [] };
    expect(await runCodebookJob(job)).toMatchObject({ ok: false, code: "DICTIONARY_DATA_MISMATCH" });
});
test("purely categorical data do not need a numeric-role field or a numeric question", async () => {
    const job = await fixture(); job.status = "in_progress";
    const mapping = { identifier: "编号", others: ["等待分钟", " 片区 ", "备注"] }; job.fieldMapping = mapping;
    const bytes = await Bun.file(`${dir}/${job.excelFilePath}`).arrayBuffer(); const parsed = await parseSpreadsheetFile(bytes, job.excelFilePath);
    job.variableDictionary = { ...suggestVariableDictionary({ columns: parsed.columns, rows: parsed.rows, identifier: mapping.identifier, numeric: [], datasetRevision: dictionaryDatasetRevision(bytes, job.excelFilePath!, mapping) }), revision: 1 };
    (job.questionnaire as any).questions[0] = { id: "n", type: "boolean", content: "是否理解这份问卷？" };
    expect((await runCodebookJob(job)).ok).toBe(true);
});
test("saved work can export before submission using the confirmed live dictionary", async () => {
    const job = await fixture(); job.status = "in_progress"; job.submissionSnapshot = null;
    expect((await runCodebookJob(job)).ok).toBe(true);
});
for (const scenario of ["missing-snapshot", "string-snapshot", "missing-dictionary", "changed-file", "changed-mapping", "string-results", "embedded-rows", "stale-binding", "unknown-profile", "bad-question", "counter", "counter-missing", "unknown-status"]) test(`codebook job fails closed: ${scenario}`, async () => {
    const job = await fixture(), snapshot = job.submissionSnapshot as any;
    if (scenario === "missing-snapshot") job.submissionSnapshot = null;
    if (scenario === "string-snapshot") job.submissionSnapshot = JSON.stringify(snapshot);
    if (scenario === "missing-dictionary") delete snapshot.variableDictionary;
    if (scenario === "changed-file") await Bun.write(`${dir}/${job.excelFilePath}`, (await Bun.file(`${dir}/${job.excelFilePath}`).text()).replace("001,10", "001,11"));
    if (scenario === "changed-mapping") (job.fieldMapping as any).numeric = [];
    if (scenario === "string-results") snapshot.samplingResults = JSON.stringify(snapshot.samplingResults);
    if (scenario === "embedded-rows") snapshot.samplingResults = { simple: { completed: true, seed: 123, sampleCount: 1, data: [{ fake: 10 }] } };
    if (scenario === "stale-binding") snapshot.questionnaire.questions[0].variableBinding.dictionaryRevision = 9;
    if (scenario === "unknown-profile") snapshot.samplingAlgorithmVersion = "old";
    if (scenario === "bad-question") delete snapshot.questionnaire.questions[0].numberRule;
    if (scenario === "counter-missing") { job.status = "in_progress"; delete job.variableDictionaryRevision; }
    if (scenario === "unknown-status") job.status = "unknown";
    if (scenario === "counter") { job.status = "in_progress"; job.variableDictionaryRevision = 9; }
    const result = await runCodebookJob(job); expect(result.ok).toBe(false);
    if (!result.ok) expect([404, 409]).toContain(result.status);
});
