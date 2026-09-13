import { dictionaryDatasetRevision, readStoredVariableDictionary } from "@/server/variable-dictionary";
import { resolveStoragePath } from "@/server/storage-files";
import { MAX_SPREADSHEET_UPLOAD_BYTES } from "@/lib/spreadsheet";
import { findStudentTaskSubmitInfo } from "./task-info";

/** Task/class-scoped access, never a topic ID supplied by the student. Only confirmed metadata is exposed. */
export async function readStudentVariableDictionary(taskId: number, classId: number) {
    const info = await findStudentTaskSubmitInfo(taskId, classId);
    if (!info) return { ok: false as const, message: "任务不存在", code: "NOT_FOUND", status: 404 };
    const stored = readStoredVariableDictionary(info.variableDictionary, info.variableDictionaryRevision);
    if (!stored.ok) return stored;
    if (!stored.value) return { ok: true as const, dictionary: null };
    try {
        if (!info.excelFilePath) throw new Error("missing source");
        const file = Bun.file(resolveStoragePath(info.excelFilePath));
        if (file.size > MAX_SPREADSHEET_UPLOAD_BYTES) throw new Error("oversized source");
        const revision = dictionaryDatasetRevision(await file.arrayBuffer(), info.excelFilePath, info.fieldMapping);
        if (revision !== stored.value.datasetRevision) return { ok: false as const, message: "总体来源与变量字典不一致，请联系教师", code: "DATASET_CHANGED", status: 409 };
        return { ok: true as const, dictionary: stored.value };
    } catch {
        return { ok: false as const, message: "无法读取变量字典的来源数据，请联系教师", code: "READ_FAILED", status: 422 };
    }
}
