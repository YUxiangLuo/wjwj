import { and, count, eq } from "drizzle-orm";
import { basename } from "node:path";
import { db } from "../../db";
import { topic, topicAttachment, topicRecommendQuestion } from "../../db/schema";
import { copyStorageFile, createStorageUploadPath, deleteStorageFileIfExists, writeStorageFile } from "../../server/storage-files";
import { getAttachmentType, sanitizeUploadFileName } from "./file-utils";
import { validateRecommendQuestionItems, validateTopicAttachmentUpload } from "./validation";

interface ServiceFailure {
    ok: false;
    code: string;
    message: string;
    status: number;
}

function fail(message: string, code = "VALIDATION_ERROR", status = 400): ServiceFailure {
    return { ok: false, code, message, status };
}

function normalizeJsonColumnValue<T>(value: T | string | null | undefined) {
    if (typeof value !== "string") return value ?? null;

    try {
        return JSON.parse(value) as T;
    } catch {
        return value;
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
        await writeStorageFile(filePath, buffer);
        const [result] = await db.insert(topicAttachment).values({
            topicId: params.topicId,
            fileName: params.file.name,
            filePath,
            fileType: params.file.type || "unknown",
            fileSize: params.file.size,
        });

        return { ok: true as const, id: result.insertId, filePath };
    } catch (error) {
        await deleteStorageFileIfExists(filePath).catch(() => undefined);
        throw error;
    }
}

export async function replaceTopicRecommendQuestions(params: {
    topicId: number;
    items: Array<{
        questionType: number;
        content: string;
        sortOrder?: number;
        choiceOptions?: string[] | null;
        minSelect?: number | null;
        maxSelect?: number | null;
        scaleMin?: number | null;
        scaleMax?: number | null;
        scaleMinLabel?: string | null;
        scaleMaxLabel?: string | null;
    }>;
}) {
    const validationError = validateRecommendQuestionItems(params.items);
    if (validationError) {
        return fail(validationError);
    }

    await db.transaction(async (tx) => {
        await tx.delete(topicRecommendQuestion).where(eq(topicRecommendQuestion.topicId, params.topicId));
        for (const item of params.items) {
            await tx.insert(topicRecommendQuestion).values({
                topicId: params.topicId,
                questionType: item.questionType,
                content: item.content,
                choiceOptions: item.choiceOptions ?? null,
                minSelect: item.minSelect ?? null,
                maxSelect: item.maxSelect ?? null,
                scaleMin: item.scaleMin ?? null,
                scaleMax: item.scaleMax ?? null,
                scaleMinLabel: item.scaleMinLabel ?? null,
                scaleMaxLabel: item.scaleMaxLabel ?? null,
                sortOrder: item.sortOrder ?? 0,
            });
        }
    });

    return { ok: true as const };
}

export async function deleteTopicAttachment(params: {
    topicId: number;
    attachmentId: number;
}) {
    const filePath = await db.transaction(async (tx) => {
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
    const [sourceTopic] = await db.select().from(topic).where(eq(topic.id, params.topicId));
    if (!sourceTopic) {
        return fail("课题不存在", "NOT_FOUND", 404);
    }

    const attachments = await db.select().from(topicAttachment).where(eq(topicAttachment.topicId, params.topicId));
    const questions = await db.select().from(topicRecommendQuestion).where(eq(topicRecommendQuestion.topicId, params.topicId));
    const copiedStoragePaths: string[] = [];

    try {
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

        const newTopicId = await db.transaction(async (tx) => {
            const [result] = await tx.insert(topic).values({
                teacherId: params.teacherId,
                name: `${sourceTopic.name} (副本)`,
                description: sourceTopic.description ?? "",
                excelFilePath: copiedExcelFilePath,
                excelRowCount: sourceTopic.excelRowCount,
                fieldMapping: normalizeJsonColumnValue(sourceTopic.fieldMapping),
                weightConfig: normalizeJsonColumnValue(sourceTopic.weightConfig),
                status: 0,
            });

            const insertedTopicId = Number(result.insertId);

            if (copiedAttachments.length) {
                await tx.insert(topicAttachment).values(
                    copiedAttachments.map((attachment) => ({
                        topicId: insertedTopicId,
                        ...attachment,
                    }))
                );
            }

            if (questions.length) {
                await tx.insert(topicRecommendQuestion).values(
                    questions.map((question) => {
                        const co = normalizeJsonColumnValue(question.choiceOptions);
                        const choiceOptions = Array.isArray(co) ? (co as string[]) : null;
                        return {
                            topicId: insertedTopicId,
                            questionType: question.questionType,
                            content: question.content,
                            choiceOptions,
                            minSelect: question.minSelect ?? null,
                            maxSelect: question.maxSelect ?? null,
                            scaleMin: question.scaleMin ?? null,
                            scaleMax: question.scaleMax ?? null,
                            scaleMinLabel: question.scaleMinLabel ?? null,
                            scaleMaxLabel: question.scaleMaxLabel ?? null,
                            sortOrder: question.sortOrder,
                        };
                    })
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
