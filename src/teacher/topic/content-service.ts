import { and, count, eq, sum } from "drizzle-orm";
import { basename } from "node:path";
import { db } from "../../db";
import { task, topic, topicAttachment } from "../../db/schema";
import { acquireStorageMutationLock } from "../../db/storage-mutation-lock";
import { copyStorageFile, createStorageUploadPath, deleteStorageFileIfExists, writeStorageFile } from "../../server/storage-files";
import {
    attachmentContentMatchesExtension,
    getAttachmentContentType,
    getAttachmentType,
    sanitizeUploadFileName,
} from "./file-utils";
import { validateTopicAttachmentUpload } from "./validation";
import type { Question } from "../../lib/questionnaire-types";
import { parseRecommendQuestionsPayload } from "../../lib/validate-question";
import { retitleGeneratedStudyContract } from "../../lib/analysis-target";
import { deleteTopicStorageFileIfUnreferenced } from "./storage-cleanup";

interface ServiceFailure {
    ok: false;
    code: string;
    message: string;
    status: number;
}

function fail(message: string, code = "VALIDATION_ERROR", status = 400): ServiceFailure {
    return { ok: false, code, message, status };
}

function normalizeJsonColumnValue<T>(value: T | string | null | undefined): T | null {
    if (typeof value !== "string") return (value as T) ?? null;

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

export async function uploadTopicAttachment(params: {
    teacherId: number;
    topicId: number;
    file: File;
}) {
    if (typeof params.file.name !== "string" || params.file.size <= 0) {
        return fail("附件文件为空或无效", "INVALID_FILE");
    }
    const attachmentType = getAttachmentType(params.file.name);
    const validationError = validateTopicAttachmentUpload(
        { currentCount: 0, fileSize: params.file.size, fileName: params.file.name },
        attachmentType,
    );
    if (validationError) return fail(validationError);

    const buffer = await params.file.arrayBuffer();
    if (!attachmentContentMatchesExtension(params.file.name, new Uint8Array(buffer))) {
        return fail("文件内容与扩展名不匹配", "INVALID_FILE");
    }

    const filePath = createStorageUploadPath(sanitizeUploadFileName(params.file.name));

    try {
        const result = await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
            const [activeTopic] = await tx
                .select({ id: topic.id })
                .from(topic)
                .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
            if (!activeTopic) return fail("实验模板不存在", "NOT_FOUND", 404);
            const [taskReference] = await tx
                .select({ id: task.id })
                .from(task)
                .where(eq(task.topicId, params.topicId))
                .limit(1);
            if (taskReference) {
                return fail(
                    "实验模板已分配任务，教学资料不能再修改；如需调整请复制为新模板",
                    "TOPIC_ASSIGNED",
                    409,
                );
            }

            const [countRow] = await tx
                .select({ count: count(), totalSize: sum(topicAttachment.fileSize) })
                .from(topicAttachment)
                .where(eq(topicAttachment.topicId, params.topicId));
            const countError = validateTopicAttachmentUpload(
                {
                    currentCount: countRow?.count ?? 0,
                    currentTotalBytes: Number(countRow?.totalSize ?? 0),
                    fileSize: params.file.size,
                    fileName: params.file.name,
                },
                attachmentType,
            );
            if (countError) return fail(countError);

            await writeStorageFile(filePath, buffer);
            const [created] = await tx
                .insert(topicAttachment)
                .values({
                    topicId: params.topicId,
                    fileName: params.file.name,
                    filePath,
                    fileType: getAttachmentContentType(params.file.name),
                    fileSize: params.file.size,
                })
                .returning({ id: topicAttachment.id });
            return { ok: true as const, id: created!.id };
        });

        if (!result.ok) return result;
        return { ok: true as const, id: result.id, filePath };
    } catch (error) {
        await deleteStorageFileIfExists(filePath).catch(() => undefined);
        throw error;
    }
}

export async function replaceTopicRecommendQuestions(params: {
    teacherId: number;
    topicId: number;
    items: unknown;
}) {
    const arr = Array.isArray(params.items) ? params.items : [];
    const parsed = parseRecommendQuestionsPayload(arr);
    if (!parsed.ok) {
        return fail(parsed.error);
    }

    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [activeTopic] = await tx
            .select({ id: topic.id })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
        if (!activeTopic) return fail("实验模板不存在", "NOT_FOUND", 404);
        const [taskReference] = await tx
            .select({ id: task.id })
            .from(task)
            .where(eq(task.topicId, params.topicId))
            .limit(1);
        if (taskReference) {
            return fail(
                "实验模板已分配任务，推荐题目不能再修改；如需调整请复制为新模板",
                "TOPIC_ASSIGNED",
                409,
            );
        }
        const [updated] = await tx
            .update(topic)
            .set({ recommendQuestions: parsed.questions, updatedAt: new Date() })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)))
            .returning({ id: topic.id });
        return updated ? { ok: true as const } : fail("实验模板不存在", "NOT_FOUND", 404);
    });
}

export async function deleteTopicAttachment(params: {
    teacherId: number;
    topicId: number;
    attachmentId: number;
}) {
    const deletion = await db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [activeTopic] = await tx
            .select({ id: topic.id })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
        if (!activeTopic) return fail("实验模板不存在", "NOT_FOUND", 404);
        const [taskReference] = await tx
            .select({ id: task.id })
            .from(task)
            .where(eq(task.topicId, params.topicId))
            .limit(1);
        if (taskReference) {
            return fail(
                "实验模板已分配任务，教学资料不能再修改；如需调整请复制为新模板",
                "TOPIC_ASSIGNED",
                409,
            );
        }

        const [attachment] = await tx
            .select({ filePath: topicAttachment.filePath })
            .from(topicAttachment)
            .where(and(eq(topicAttachment.id, params.attachmentId), eq(topicAttachment.topicId, params.topicId)));
        if (!attachment?.filePath) return fail("附件不存在", "NOT_FOUND", 404);

        await tx.delete(topicAttachment).where(and(eq(topicAttachment.id, params.attachmentId), eq(topicAttachment.topicId, params.topicId)));
        return { ok: true as const, filePath: attachment.filePath };
    });

    if (!deletion.ok) return deletion;
    await deleteTopicStorageFileIfUnreferenced(deletion.filePath).catch(() => undefined);
    return { ok: true as const };
}

export async function copyTopicWithResources(params: {
    teacherId: number;
    topicId: number;
}) {
    const copiedStoragePaths: string[] = [];

    try {
        const newTopicId = await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
            const [sourceTopic] = await tx
                .select()
                .from(topic)
                .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
            if (!sourceTopic) return null;
            const attachments = await tx.select().from(topicAttachment).where(eq(topicAttachment.topicId, params.topicId));

            const copiedExcelFilePath = sourceTopic.excelFilePath
                ? createStorageUploadPath(sanitizeUploadFileName(basename(sourceTopic.excelFilePath)))
                : null;

            if (sourceTopic.excelFilePath && copiedExcelFilePath) {
                await copyStorageFile(sourceTopic.excelFilePath, copiedExcelFilePath);
                copiedStoragePaths.push(copiedExcelFilePath);
            }

            const copiedAttachments: Array<{
                fileName: string;
                filePath: string;
                fileType: string;
                fileSize: number;
            }> = [];
            for (const attachment of attachments) {
                const copiedFilePath = createStorageUploadPath(sanitizeUploadFileName(attachment.fileName));
                await copyStorageFile(attachment.filePath, copiedFilePath);
                copiedStoragePaths.push(copiedFilePath);
                copiedAttachments.push({
                    fileName: attachment.fileName,
                    filePath: copiedFilePath,
                    fileType: attachment.fileType,
                    fileSize: attachment.fileSize,
                });
            }

            const recommendQuestions =
                (normalizeJsonColumnValue(sourceTopic.recommendQuestions as Question[] | string | null | undefined) ?? null) as
                    | Question[]
                    | null;

            const copySuffix = " (副本)";
            const copiedName = `${Array.from(sourceTopic.name).slice(0, 200 - Array.from(copySuffix).length).join("")}${copySuffix}`;
            const sourceFieldMapping = normalizeJsonColumnValue(sourceTopic.fieldMapping);
            const [created] = await tx
                .insert(topic)
                .values({
                    teacherId: params.teacherId,
                    name: copiedName,
                    description: sourceTopic.description ?? "",
                    excelFilePath: copiedExcelFilePath,
                    excelRowCount: sourceTopic.excelRowCount,
                    fieldMapping: retitleGeneratedStudyContract(sourceFieldMapping, sourceTopic.name, copiedName),
                    samplingPolicy: normalizeJsonColumnValue(sourceTopic.samplingPolicy),
                    weightConfig: normalizeJsonColumnValue(sourceTopic.weightConfig),
                    recommendQuestions: recommendQuestions ?? null,
                    status: 0,
                })
                .returning({ id: topic.id });

            const insertedTopicId = created!.id;

            if (copiedAttachments.length) {
                await tx.insert(topicAttachment).values(
                    copiedAttachments.map((attachment) => ({
                        topicId: insertedTopicId,
                        ...attachment,
                    }))
                );
            }

            return insertedTopicId;
        });

        if (newTopicId === null) return fail("实验模板不存在", "NOT_FOUND", 404);
        return { ok: true as const, id: newTopicId };
    } catch (error) {
        await Promise.all(copiedStoragePaths.map((filePath) => deleteStorageFileIfExists(filePath).catch(() => undefined)));
        throw error;
    }
}
