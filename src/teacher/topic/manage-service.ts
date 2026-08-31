import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { task, topic, topicAttachment } from "../../db/schema";
import { acquireStorageMutationLock } from "../../db/storage-mutation-lock";
import { validateAnalysisTarget } from "../../lib/analysis-target";
import { validateSpreadsheetUploadFile } from "../../lib/spreadsheet";
import { createStorageUploadPath, deleteStorageFileIfExists, resolveStoragePath, writeStorageFile } from "../../server/storage-files";
import { parseExcelFile, sanitizeUploadFileName } from "./file-utils";
import { deleteTopicStorageFileIfUnreferenced } from "./storage-cleanup";
import {
    validateParsedExcelUpload,
    validateNumericFieldValues,
    validateTopicPublishReadiness,
    validateStratifiedValueCardinality,
    validateTopicFieldMappingColumns,
    validateTopicFieldMappingConfig,
    validateTopicName,
    validateWeightConfig,
} from "./validation";

interface ServiceFailure {
    ok: false;
    code: string;
    message: string;
    status: number;
}

function fail(message: string, code = "VALIDATION_ERROR", status = 400): ServiceFailure {
    return { ok: false, code, message, status };
}

export async function createTeacherTopic(params: {
    teacherId: number;
    name: string;
    description?: string;
    status?: number;
}) {
    const nameError = validateTopicName(params.name);
    if (nameError) return fail(nameError);
    if (params.description !== undefined && typeof params.description !== "string") {
        return fail("课题描述格式无效");
    }
    if (params.status !== undefined && params.status !== 0 && params.status !== 1) {
        return fail("课题状态无效");
    }
    if (params.status === 1) {
        return fail("课题需先上传总体数据后才能发布");
    }

    const [created] = await db
        .insert(topic)
        .values({
            teacherId: params.teacherId,
            name: params.name.trim(),
            description: params.description ?? "",
            status: params.status ?? 0,
        })
        .returning({ id: topic.id });

    return { ok: true as const, id: created!.id };
}

export async function updateTeacherTopicBasics(params: {
    teacherId: number;
    topicId: number;
    body: { name?: string; description?: string; status?: number };
}) {
    if (params.body.status !== undefined && params.body.status !== 0 && params.body.status !== 1) {
        return fail("课题状态无效");
    }
    if (params.body.description !== undefined && typeof params.body.description !== "string") {
        return fail("课题描述格式无效");
    }
    const updateData: Record<string, unknown> = {};
    if (params.body.name !== undefined) {
        const nameError = validateTopicName(params.body.name);
        if (nameError) return fail(nameError);
        updateData.name = params.body.name.trim();
    }
    if (params.body.description !== undefined) updateData.description = params.body.description;
    if (params.body.status !== undefined) updateData.status = params.body.status;

    if (Object.keys(updateData).length === 0) {
        return { ok: true as const };
    }

    updateData.updatedAt = new Date();

    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [topicInfo] = await tx
            .select({
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
                weightConfig: topic.weightConfig,
            })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)));
        if (!topicInfo) return fail("课题不存在", "NOT_FOUND", 404);
        const [taskReference] = await tx
            .select({ id: task.id })
            .from(task)
            .where(eq(task.topicId, params.topicId))
            .limit(1);
        if (taskReference) {
            return fail(
                "课题已分配任务，内容不能再修改；如需调整请复制为新课题",
                "TOPIC_ASSIGNED",
                409,
            );
        }

        if (params.body.status === 1) {
            const publishReadinessError = validateTopicPublishReadiness({
                excelFilePath: topicInfo.excelFilePath,
                fieldMapping: topicInfo.fieldMapping as Record<string, unknown> | string | null | undefined,
                weightConfig: topicInfo.weightConfig as Record<string, unknown> | string | null | undefined,
            });
            if (publishReadinessError) return fail(publishReadinessError);
        }

        const [updated] = await tx
            .update(topic)
            .set(updateData)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)))
            .returning({ id: topic.id });
        return updated ? { ok: true as const } : fail("课题不存在", "NOT_FOUND", 404);
    });
}

const assignedTopicDeletion = Symbol("assigned-topic-deletion");

export async function softDeleteTeacherTopic(params: { teacherId: number; topicId: number }) {
    const deletedAt = new Date();

    let deletion: { cleanupPaths: string[] } | null;
    try {
        deletion = await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
            const [deletedTopic] = await tx
                .update(topic)
                .set({ deletedAt, updatedAt: deletedAt })
                .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)))
                .returning({ id: topic.id, excelFilePath: topic.excelFilePath });

            if (!deletedTopic) return null;

            const attachmentRows = await tx
                .select({ filePath: topicAttachment.filePath })
                .from(topicAttachment)
                .where(eq(topicAttachment.topicId, params.topicId));
            const [taskReference] = await tx
                .select({ id: task.id })
                .from(task)
                .where(eq(task.topicId, params.topicId))
                .limit(1);

            if (taskReference) throw assignedTopicDeletion;

            await tx
                .update(task)
                .set({ deletedAt, updatedAt: deletedAt })
                .where(and(eq(task.topicId, params.topicId), isNull(task.deletedAt)));
            await tx.delete(topicAttachment).where(eq(topicAttachment.topicId, params.topicId));

            return {
                cleanupPaths: [deletedTopic.excelFilePath, ...attachmentRows.map((row) => row.filePath)].filter(
                    (filePath): filePath is string => Boolean(filePath),
                ),
            };
        });
    } catch (error) {
        if (error === assignedTopicDeletion) {
            return fail("已分配任务的课题不能删除", "TOPIC_ASSIGNED", 403);
        }
        throw error;
    }

    if (!deletion) {
        return fail("课题不存在", "NOT_FOUND", 404);
    }

    await Promise.all(deletion.cleanupPaths.map(async (filePath) => {
        await deleteTopicStorageFileIfUnreferenced(filePath, { excludeTopicId: params.topicId }).catch((error) => {
            console.warn(`已删除课题的存储文件清理失败：${filePath}`, error);
        });
    }));

    return { ok: true as const };
}

export async function replaceTopicExcelData(params: {
    teacherId: number;
    topicId: number;
    file: File;
}) {
    const fileError = validateSpreadsheetUploadFile(params.file);
    if (fileError) return fail(fileError.message, fileError.code, fileError.status);

    const buffer = await params.file.arrayBuffer();
    const parsed = await parseExcelFile(buffer, params.file.name);
    const validationError = validateParsedExcelUpload(parsed);
    if (validationError) return fail(validationError);

    const filePath = createStorageUploadPath(sanitizeUploadFileName(params.file.name));

    let previousFilePath: string | null = null;
    try {
        const replacement = await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
            const [currentTopic] = await tx
                .select({ excelFilePath: topic.excelFilePath, status: topic.status })
                .from(topic)
                .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)));
            if (!currentTopic) return fail("课题不存在", "NOT_FOUND", 404);
            const [taskReference] = await tx.select({ id: task.id }).from(task).where(eq(task.topicId, params.topicId)).limit(1);
            if (currentTopic.status === 1 || taskReference) {
                return fail("已发布或已分配任务的课题不能修改总体数据", "FORBIDDEN", 403);
            }

            await writeStorageFile(filePath, buffer);
            const [updated] = await tx
                .update(topic)
                .set({
                    excelFilePath: filePath,
                    excelRowCount: parsed.rowCount,
                    fieldMapping: null,
                    updatedAt: new Date(),
                })
                .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)))
                .returning({ id: topic.id });
            if (!updated) throw new Error("TOPIC_UPDATE_CONFLICT");
            return { ok: true as const, previousFilePath: currentTopic.excelFilePath };
        });
        if (!replacement.ok) return replacement;
        previousFilePath = replacement.previousFilePath;
    } catch (error) {
        await deleteStorageFileIfExists(filePath).catch(() => undefined);
        throw error;
    }

    if (previousFilePath && previousFilePath !== filePath) {
        await deleteTopicStorageFileIfUnreferenced(previousFilePath).catch((error) => {
            console.warn(`旧总体数据文件清理失败：${previousFilePath}`, error);
        });
    }

    return {
        ok: true as const,
        filePath,
        rowCount: parsed.rowCount,
        colCount: parsed.colCount,
        columns: parsed.columns,
        preview: parsed.preview,
        columnValues: parsed.columnValues,
    };
}

export async function updateTopicFieldMapping(params: {
    teacherId: number;
    topicId: number;
    fieldMapping: {
        identifier?: string;
        stratified?: string[];
        numeric?: string[];
        others?: string[];
        analysisTarget?: { kind?: string; field?: string; value?: string };
    };
}) {
    const mappingError = validateTopicFieldMappingConfig(params.fieldMapping);
    if (mappingError) return fail(mappingError);

    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [topicInfo] = await tx
            .select({ excelFilePath: topic.excelFilePath, status: topic.status })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)));
        if (!topicInfo) return fail("课题不存在", "NOT_FOUND", 404);
        const [taskReference] = await tx.select({ id: task.id }).from(task).where(eq(task.topicId, params.topicId)).limit(1);
        if (topicInfo.status === 1 || taskReference) {
            return fail("已发布或已分配任务的课题不能修改字段映射", "FORBIDDEN", 403);
        }
        if (!topicInfo.excelFilePath) return fail("请先上传总体数据");

        const buffer = await Bun.file(resolveStoragePath(topicInfo.excelFilePath)).arrayBuffer();
        const parsed = await parseExcelFile(buffer, topicInfo.excelFilePath);
        const columnsError = validateTopicFieldMappingColumns(params.fieldMapping, parsed.columns);
        if (columnsError) return fail(columnsError);
        const cardinalityError = validateStratifiedValueCardinality(parsed.rows, params.fieldMapping.stratified ?? []);
        if (cardinalityError) return fail(cardinalityError);
        const numericValueError = validateNumericFieldValues(parsed.rows, params.fieldMapping.numeric ?? []);
        if (numericValueError) return fail(numericValueError);
        const analysisError = validateAnalysisTarget(params.fieldMapping, parsed.rows);
        if (analysisError) return fail(analysisError);

        const [updated] = await tx
            .update(topic)
            .set({ fieldMapping: params.fieldMapping, updatedAt: new Date() })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)))
            .returning({ id: topic.id });
        return updated ? { ok: true as const } : fail("课题不存在", "NOT_FOUND", 404);
    });
}

export async function updateTopicWeightConfig(params: {
    teacherId: number;
    topicId: number;
    weightConfig: { questionnaire: number; process: number; report: number } | null | undefined;
}) {
    const weightError = validateWeightConfig(params.weightConfig);
    if (weightError) return fail(weightError);

    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [topicInfo] = await tx
            .select({ status: topic.status })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)));
        if (!topicInfo) return fail("课题不存在", "NOT_FOUND", 404);
        const [taskReference] = await tx.select({ id: task.id }).from(task).where(eq(task.topicId, params.topicId)).limit(1);
        if (topicInfo.status === 1 || taskReference) {
            return fail("已发布或已分配任务的课题不能修改评分权重", "FORBIDDEN", 403);
        }
        const [updated] = await tx
            .update(topic)
            .set({ weightConfig: params.weightConfig, updatedAt: new Date() })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)))
            .returning({ id: topic.id });
        return updated ? { ok: true as const } : fail("课题不存在", "NOT_FOUND", 404);
    });
}
