import { and, count, eq, isNull } from "drizzle-orm";
import { basename } from "node:path";
import { db } from "../../db";
import { topic, topicAttachment } from "../../db/schema";
import { acquireStorageMutationLock } from "../../db/storage-mutation-lock";
import { copyStorageFile, createStorageUploadPath, deleteStorageFileIfExists, writeStorageFile } from "../../server/storage-files";
import { getAttachmentType, sanitizeUploadFileName } from "./file-utils";
import { validateTopicAttachmentUpload } from "./validation";
import type { Question } from "../../lib/questionnaire-types";
import { parseRecommendQuestionsPayload } from "../../lib/validate-question";

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
    topicId: number;
    file: File;
}) {
    const [countRow] = await db.select({ count: count() }).from(topicAttachment).where(eq(topicAttachment.topicId, params.topicId));
    const attachmentType = getAttachmentType(params.file.name, params.file.type || "");
    const validationError = validateTopicAttachmentUpload(
        {
            currentCount: countRow?.count ?? 0,
            fileName: params.file.name,
            mimeType: params.file.type || "",
            fileSize: params.file.size,
        },
        attachmentType
    );
    if (validationError) {
        return fail(validationError);
    }

    const buffer = await params.file.arrayBuffer();
    const filePath = createStorageUploadPath(sanitizeUploadFileName(params.file.name));

    try {
        const createdId = await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
            await writeStorageFile(filePath, buffer);
            const [created] = await tx
                .insert(topicAttachment)
                .values({
                    topicId: params.topicId,
                    fileName: params.file.name,
                    filePath,
                    fileType: params.file.type || "unknown",
                    fileSize: params.file.size,
                })
                .returning({ id: topicAttachment.id });
            return created!.id;
        });

        return { ok: true as const, id: createdId, filePath };
    } catch (error) {
        await deleteStorageFileIfExists(filePath).catch(() => undefined);
        throw error;
    }
}

export async function replaceTopicRecommendQuestions(params: {
    topicId: number;
    items: unknown;
}) {
    const arr = Array.isArray(params.items) ? params.items : [];
    const parsed = parseRecommendQuestionsPayload(arr);
    if (!parsed.ok) {
        return fail(parsed.error);
    }

    await db
        .update(topic)
        .set({ recommendQuestions: parsed.questions, updatedAt: new Date() })
        .where(eq(topic.id, params.topicId));

    return { ok: true as const };
}

export async function deleteTopicAttachment(params: {
    topicId: number;
    attachmentId: number;
}) {
    const filePath = await db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [attachment] = await tx
            .select({ filePath: topicAttachment.filePath })
            .from(topicAttachment)
            .where(and(eq(topicAttachment.id, params.attachmentId), eq(topicAttachment.topicId, params.topicId)));

        if (!attachment?.filePath) {
            return null;
        }

        await tx.delete(topicAttachment).where(and(eq(topicAttachment.id, params.attachmentId), eq(topicAttachment.topicId, params.topicId)));

        const [refCount] = await tx
            .select({ count: count() })
            .from(topicAttachment)
            .where(eq(topicAttachment.filePath, attachment.filePath));

        return (refCount?.count ?? 0) === 0 ? attachment.filePath : null;
    });

    if (filePath) {
        await deleteStorageFileIfExists(filePath).catch(() => undefined);
    }

    return { ok: true as const };
}

export async function copyTopicWithResources(params: {
    teacherId: number;
    topicId: number;
}) {
    const [sourceTopic] = await db
        .select()
        .from(topic)
        .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)));
    if (!sourceTopic) {
        return fail("课题不存在", "NOT_FOUND", 404);
    }

    const attachments = await db.select().from(topicAttachment).where(eq(topicAttachment.topicId, params.topicId));
    const copiedStoragePaths: string[] = [];

    try {
        const newTopicId = await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
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

            const [created] = await tx
                .insert(topic)
                .values({
                    teacherId: params.teacherId,
                    name: `${sourceTopic.name} (副本)`,
                    description: sourceTopic.description ?? "",
                    excelFilePath: copiedExcelFilePath,
                    excelRowCount: sourceTopic.excelRowCount,
                    fieldMapping: normalizeJsonColumnValue(sourceTopic.fieldMapping),
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

        return { ok: true as const, id: newTopicId };
    } catch (error) {
        await Promise.all(copiedStoragePaths.map((filePath) => deleteStorageFileIfExists(filePath).catch(() => undefined)));
        throw error;
    }
}
