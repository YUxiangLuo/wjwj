import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { task, topic } from "../../db/schema";
import { acquireStorageMutationLock } from "../../db/storage-mutation-lock";
import { parseTopicFieldMapping } from "../../domain/statistics/population";
import {
    parseVariableDictionary, suggestVariableDictionary, validateDictionaryPopulation,
    type VariableDictionaryV1,
} from "../../domain/experiment/variable-dictionary";
import { parseSpreadsheetFile, validateSpreadsheetUploadFile } from "../../lib/spreadsheet";
import { resolveStoragePath } from "../../server/storage-files";
import { dictionaryDatasetRevision, readStoredVariableDictionary } from "../../server/variable-dictionary";
import { validateMappedPopulationData } from "./validation";

function fail(message: string, code = "VALIDATION_ERROR", status = 400) {
    return { ok: false as const, message, code, status };
}

/** Read/write share the storage lock with upload, mapping, copy, publish and assignment.
 * A GET only suggests metadata; it never upgrades old templates or writes source data.
 */
export async function accessTeacherVariableDictionary(params: {
    teacherId: number; topicId: number;
    /** Omitted for GET; any supplied value (including null) is a PUT payload. */
    input?: unknown;
}) {
    const writing = Object.hasOwn(params, "input");
    const requested = writing ? parseVariableDictionary(params.input) : null;
    if (requested && !requested.ok) return fail(requested.error);
    return db.transaction(async tx => {
        await acquireStorageMutationLock(tx);
        const [row] = await tx.select({
            status: topic.status, excelFilePath: topic.excelFilePath, fieldMapping: topic.fieldMapping,
            variableDictionary: topic.variableDictionary,
            variableDictionaryRevision: topic.variableDictionaryRevision,
        }).from(topic).where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId))).for("update");
        if (!row) return fail("实验模板不存在", "NOT_FOUND", 404);
        const [assigned] = await tx.select({ id: task.id }).from(task).where(eq(task.topicId, params.topicId)).limit(1);
        const editable = row.status === 0 && !assigned;
        if (writing && !editable) return fail("已发布或已分配任务的实验模板不能修改变量字典，请复制为新模板", "FORBIDDEN", 403);
        if (!row.excelFilePath || !row.fieldMapping) return fail("请先上传总体数据并保存研究目标与字段配置");
        const mapping = parseTopicFieldMapping(row.fieldMapping);
        if (!mapping) return fail("研究目标与字段配置无效");
        const stored = readStoredVariableDictionary(row.variableDictionary, row.variableDictionaryRevision ?? 0);
        if (!stored.ok) return stored;
        let buffer: ArrayBuffer;
        let parsed: Awaited<ReturnType<typeof parseSpreadsheetFile>>;
        try {
            const file = Bun.file(resolveStoragePath(row.excelFilePath));
            const fileError = validateSpreadsheetUploadFile({ name: row.excelFilePath, size: file.size });
            if (fileError) return fail(fileError.message, fileError.code, fileError.status);
            buffer = await file.arrayBuffer();
            parsed = await parseSpreadsheetFile(buffer, row.excelFilePath, { numericFields: mapping.numeric ?? [], includeColumnValues: false });
        } catch {
            return fail("无法读取总体数据，请检查原文件或重新上传", "READ_FAILED", 422);
        }
        const populationError = validateMappedPopulationData(parsed, mapping);
        if (populationError) return fail(populationError);
        const datasetRevision = dictionaryDatasetRevision(buffer, row.excelFilePath, row.fieldMapping);
        if (stored.value && stored.value.datasetRevision !== datasetRevision) return fail("总体数据或字段配置已改变，请重新上传并配置字典", "DATASET_CHANGED", 409);
        const revision = row.variableDictionaryRevision ?? 0;
        const current: VariableDictionaryV1 = stored.value ?? {
            ...suggestVariableDictionary({ ...parsed, datasetRevision, identifier: mapping.identifier, numeric: mapping.numeric }),
            revision,
        };
        if (!writing) {
            const check = parseVariableDictionary(current);
            if (!check.ok) return fail(check.error);
            return { ok: true as const, dictionary: current, confirmed: stored.value !== null, editable };
        }
        if (!requested?.ok) return fail("变量字典格式无效");
        if (requested.value.datasetRevision !== datasetRevision || requested.value.revision !== current.revision) {
            return fail("总体或变量字典已发生变化，请重新加载后核对", "VERSION_CONFLICT", 409);
        }
        if (current.revision === Number.MAX_SAFE_INTEGER) return fail("字典修订版本已达上限，请复制为新模板", "VERSION_LIMIT", 409);
        // Keep the existing sampling interpretation completely separate. Analysis-only
        // numeric declarations use raw XLSX values, without altering the source/mapping.
        let analysisRows: Awaited<ReturnType<typeof parseSpreadsheetFile>>;
        try {
            analysisRows = await parseSpreadsheetFile(buffer, row.excelFilePath, {
                numericFields: requested.value.variables.filter(v => v.storageType === "number").map(v => v.sourceField),
                includeColumnValues: false,
            });
        } catch {
            return fail("无法按指定类型读取总体数据", "READ_FAILED", 422);
        }
        const validationError = validateDictionaryPopulation(requested.value, { ...analysisRows, identifier: mapping.identifier });
        if (validationError) return fail(validationError);
        const dictionary: VariableDictionaryV1 = { ...requested.value, revision: current.revision + 1 };
        const [updated] = await tx.update(topic).set({ variableDictionary: dictionary, variableDictionaryRevision: dictionary.revision, updatedAt: new Date() })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId))).returning({ id: topic.id });
        if (!updated) return fail("实验模板不存在", "NOT_FOUND", 404);
        return { ok: true as const, dictionary, confirmed: true, editable: true };
    });
}
