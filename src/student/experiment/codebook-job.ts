import { MAX_SPREADSHEET_UPLOAD_BYTES, MAX_SPREADSHEET_ROWS, parseSpreadsheetFile } from "@/lib/spreadsheet";
import { resolveStoragePath } from "@/server/storage-files";
import { dictionaryDatasetRevisionFromHash, readStoredVariableDictionary } from "@/server/variable-dictionary";
import { validateDictionaryPopulation } from "@/domain/experiment/variable-dictionary";
import { validateQuestionnaireForSubmit } from "./submit-validation";
import type { QuestionnaireData } from "@/lib/questionnaire-types";
import type { SamplingExportType } from "./sampling-results-export";
import { buildCodebookWorkbook, CodebookError, type CodebookInput } from "./codebook-workbook";
export interface CodebookJob {
    experimentId: number; taskId: number; version: number; status: string;
    submissionSnapshot: unknown; questionnaire: unknown; samplingResults: unknown;
    variableDictionary?: unknown; variableDictionaryRevision?: number;
    populationSize: unknown; excelFilePath: string | null; fieldMapping: unknown; type: SamplingExportType;
}
export type CodebookResult = { ok: true; bytes: Uint8Array } | { ok: false; code: string; message: string; status: number };
const object = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
/** No JSON-string decoding, snapshot backfill, embedded-row fallback, or caller-supplied sample data. */
export async function readVerifiedResearchInput(job: CodebookJob): Promise<CodebookInput> {
        if (!["in_progress", "submitted", "graded", "rejected"].includes(job.status)) throw new CodebookError("实验状态无效，不能选择导出版本");
        const submitted = ["submitted", "graded", "rejected"].includes(job.status);
        if (!submitted && (!Number.isSafeInteger(job.variableDictionaryRevision) || job.variableDictionaryRevision! < 0)) throw new CodebookError("当前变量字典缺少有效的独立修订计数器");
        const snapshot = job.submissionSnapshot;
        if (submitted && (!object(snapshot) || snapshot.parserVersion !== "spreadsheet-v2" || snapshot.samplingAlgorithmVersion !== "sampling-v2" || typeof snapshot.populationFileSha256 !== "string")) throw new CodebookError("提交快照缺少当前数据协议和来源证据，不用当前模板补齐");
        const source = submitted ? snapshot as Record<string, any> : { variableDictionary: job.variableDictionary, questionnaire: job.questionnaire, samplingResults: job.samplingResults, populationSize: job.populationSize };
        const stored = readStoredVariableDictionary(source.variableDictionary, submitted ? undefined : job.variableDictionaryRevision);
        if (!stored.ok) throw new CodebookError(stored.message, stored.code, stored.status);
        if (!stored.value) throw new CodebookError("请教师先确认变量字典；未确认时仍可导出原始样本 CSV", "NO_DICTIONARY");
        const dictionary = stored.value;
        const questionnaireError = validateQuestionnaireForSubmit(source.questionnaire);
        if (questionnaireError) throw new CodebookError("已保存问卷不符合当前规则，请返回问卷阶段或联系教师检查；不使用浏览器草稿修补来源");
        if (!object(job.fieldMapping) || typeof job.fieldMapping.identifier !== "string") throw new CodebookError("抽样字段配置格式无效");
        const numericFields = job.fieldMapping.numeric === undefined ? [] : job.fieldMapping.numeric;
        if (!Array.isArray(numericFields) || !numericFields.every((v: unknown) => typeof v === "string")) throw new CodebookError("数值字段配置格式无效");
        if (!job.excelFilePath) throw new CodebookError("缺少总体来源文件", "READ_FAILED", 422);
        const file = Bun.file(resolveStoragePath(job.excelFilePath));
        if (file.size > MAX_SPREADSHEET_UPLOAD_BYTES) throw new CodebookError("总体文件超过读取上限", "EXPORT_TOO_LARGE", 413);
        const bytes = await file.arrayBuffer();
        if (bytes.byteLength > MAX_SPREADSHEET_UPLOAD_BYTES) throw new CodebookError("总体文件超过读取上限", "EXPORT_TOO_LARGE", 413);
        const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
        if ((submitted && hash !== source.populationFileSha256) || dictionary.datasetRevision !== dictionaryDatasetRevisionFromHash(hash, job.excelFilePath, job.fieldMapping)) throw new CodebookError("总体文件或读取配置已改变，不能用新来源重建旧样本", "DATASET_CHANGED");
        const population = await parseSpreadsheetFile(bytes, job.excelFilePath, { numericFields, includeColumnValues: false });
        if (population.rows.length < 1 || population.rows.length > MAX_SPREADSHEET_ROWS || population.malformed || population.duplicateColumns.length || population.blankColumnIndexes.length || population.rows.length !== source.populationSize) throw new CodebookError("总体行数或字段结构与实验不一致", "DATASET_CHANGED");
        if (validateDictionaryPopulation(dictionary, { columns: population.columns, rows: population.rows, identifier: job.fieldMapping.identifier })) throw new CodebookError("字典与原抽样读取方式不一致，请教师检查字段配置；不会为导出自动转换原值", "DICTIONARY_DATA_MISMATCH");
        return { experimentId: job.experimentId, taskId: job.taskId, version: job.version, source: submitted ? "submitted" : "saved", dictionary,
            questionnaire: source.questionnaire as QuestionnaireData, populationFileSha256: hash, population: population.rows, results: source.samplingResults, type: job.type };
}

export async function runCodebookJob(job: CodebookJob): Promise<CodebookResult> {
    try {
        return { ok: true, bytes: buildCodebookWorkbook(await readVerifiedResearchInput(job)) };
    } catch (cause) {
        if (cause instanceof CodebookError) return { ok: false, message: cause.message, code: cause.code, status: cause.status };
        console.error("Codebook export failed:", cause);
        return { ok: false, message: "码本导出失败，请检查总体文件或稍后重试", code: "EXPORT_FAILED", status: 500 };
    }
}
