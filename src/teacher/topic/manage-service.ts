import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { task, topic, topicAttachment } from "../../db/schema";
import { acquireStorageMutationLock } from "../../db/storage-mutation-lock";
import { validateSpreadsheetUploadFile } from "../../lib/spreadsheet";
import { createStorageUploadPath, deleteStorageFileIfExists, resolveStoragePath, writeStorageFile } from "../../server/storage-files";
import { parseExcelFile, sanitizeUploadFileName } from "./file-utils";
import {
    validateParsedExcelUpload,
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
    if (params.body.status === 1) {
        const [topicInfo] = await db
            .select({
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
                weightConfig: topic.weightConfig,
            })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)));

        if (!topicInfo) {
            return fail("课题不存在", "NOT_FOUND", 404);
        }

        const publishReadinessError = validateTopicPublishReadiness({
            excelFilePath: topicInfo.excelFilePath,
            fieldMapping: topicInfo.fieldMapping as Record<string, unknown> | string | null | undefined,
            weightConfig: topicInfo.weightConfig as Record<string, unknown> | string | null | undefined,
        });
        if (publishReadinessError) return fail(publishReadinessError);
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

    await db
        .update(topic)
        .set(updateData)
        .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)));

    return { ok: true as const };
}

export async function softDeleteTeacherTopic(params: { teacherId: number; topicId: number }) {
    const deletedAt = new Date();

    const deleted = await db.transaction(async (tx) => {
        const result = await tx
            .update(topic)
            .set({ deletedAt, updatedAt: deletedAt })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)))
            .returning({ id: topic.id });

        if (result.length === 0) {
            return false;
        }

        await tx
            .update(task)
            .set({ deletedAt, updatedAt: deletedAt })
            .where(and(eq(task.topicId, params.topicId), isNull(task.deletedAt)));

        return true;
    });

    if (!deleted) {
        return fail("课题不存在", "NOT_FOUND", 404);
    }

    return { ok: true as const };
}

export async function replaceTopicExcelData(params: {
    topicId: number;
    file: File;
    previousFilePath?: string | null;
}) {
    const fileError = validateSpreadsheetUploadFile(params.file);
    if (fileError) return fail(fileError.message, fileError.code, fileError.status);

    const buffer = await params.file.arrayBuffer();
    const parsed = await parseExcelFile(buffer, params.file.name);
    const validationError = validateParsedExcelUpload(parsed);
    if (validationError) return fail(validationError);

    const filePath = createStorageUploadPath(sanitizeUploadFileName(params.file.name));

    try {
        await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
            await writeStorageFile(filePath, buffer);
            await tx
                .update(topic)
                .set({
                    excelFilePath: filePath,
                    excelRowCount: parsed.rowCount,
                    fieldMapping: null,
                    updatedAt: new Date(),
                })
                .where(eq(topic.id, params.topicId));
        });
    } catch (error) {
        await deleteStorageFileIfExists(filePath).catch(() => undefined);
        throw error;
    }

    if (params.previousFilePath && params.previousFilePath !== filePath) {
        const [[topicReference], [attachmentReference]] = await Promise.all([
            db.select({ id: topic.id }).from(topic).where(eq(topic.excelFilePath, params.previousFilePath)).limit(1),
            db.select({ id: topicAttachment.id }).from(topicAttachment).where(eq(topicAttachment.filePath, params.previousFilePath)).limit(1),
        ]);
        if (!topicReference && !attachmentReference) {
            await deleteStorageFileIfExists(params.previousFilePath).catch((error) => {
                console.warn(`旧总体数据文件清理失败：${params.previousFilePath}`, error);
            });
        }
    }

    return {
        ok: true as const,
        filePath,
        rowCount: parsed.rowCount,
        colCount: parsed.colCount,
        columns: parsed.columns,
        preview: parsed.preview,
    };
}

export async function updateTopicFieldMapping(params: {
    topicId: number;
    fieldMapping: { identifier?: string; stratified?: string[]; numeric?: string[]; others?: string[] };
}) {
    const mappingError = validateTopicFieldMappingConfig(params.fieldMapping);
    if (mappingError) return fail(mappingError);

    const [topicInfo] = await db.select({ excelFilePath: topic.excelFilePath }).from(topic).where(eq(topic.id, params.topicId));
    if (!topicInfo?.excelFilePath) return fail("请先上传总体数据");

    const buffer = await Bun.file(resolveStoragePath(topicInfo.excelFilePath)).arrayBuffer();
    const parsed = await parseExcelFile(buffer, topicInfo.excelFilePath);
    const columnsError = validateTopicFieldMappingColumns(params.fieldMapping, parsed.columns);
    if (columnsError) return fail(columnsError);
    const cardinalityError = validateStratifiedValueCardinality(parsed.rows, params.fieldMapping.stratified ?? []);
    if (cardinalityError) return fail(cardinalityError);

    await db
        .update(topic)
        .set({ fieldMapping: params.fieldMapping, updatedAt: new Date() })
        .where(eq(topic.id, params.topicId));
    return { ok: true as const };
}

export async function updateTopicWeightConfig(params: {
    topicId: number;
    weightConfig: { questionnaire: number; process: number; report: number } | null | undefined;
}) {
    const weightError = validateWeightConfig(params.weightConfig);
    if (weightError) return fail(weightError);

    await db
        .update(topic)
        .set({ weightConfig: params.weightConfig, updatedAt: new Date() })
        .where(eq(topic.id, params.topicId));
    return { ok: true as const };
}
