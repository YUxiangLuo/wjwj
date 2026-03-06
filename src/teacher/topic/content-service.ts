import { and, count, eq } from "drizzle-orm";
import { db } from "../../db";
import { topic, topicAttachment, topicRecommendQuestion } from "../../db/schema";
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
    const fileName = `${Date.now()}_${sanitizeUploadFileName(params.file.name)}`;
    const filePath = `/storage/uploads/${fileName}`;
    await Bun.write(`${process.cwd()}${filePath}`, buffer);

    const [result] = await db.insert(topicAttachment).values({
        topicId: params.topicId,
        fileName: params.file.name,
        filePath,
        fileType: params.file.type || "unknown",
        fileSize: params.file.size,
    });

    return { ok: true as const, id: result.insertId, filePath };
}

export async function replaceTopicRecommendQuestions(params: {
    topicId: number;
    items: Array<{ questionType: number; content: string; options?: any; sortOrder?: number }>;
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
                options: item.options ?? null,
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
    await db.delete(topicAttachment).where(and(eq(topicAttachment.id, params.attachmentId), eq(topicAttachment.topicId, params.topicId)));
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

    const [result] = await db.insert(topic).values({
        teacherId: params.teacherId,
        name: `${sourceTopic.name} (副本)`,
        description: sourceTopic.description ?? "",
        excelFilePath: sourceTopic.excelFilePath,
        excelRowCount: sourceTopic.excelRowCount,
        fieldMapping: sourceTopic.fieldMapping,
        weightConfig: sourceTopic.weightConfig,
        status: 0,
    });

    const newTopicId = Number(result.insertId);

    const attachments = await db.select().from(topicAttachment).where(eq(topicAttachment.topicId, params.topicId));
    if (attachments.length) {
        await db.insert(topicAttachment).values(
            attachments.map((attachment) => ({
                topicId: newTopicId,
                fileName: attachment.fileName,
                filePath: attachment.filePath,
                fileType: attachment.fileType,
                fileSize: attachment.fileSize,
            }))
        );
    }

    const questions = await db.select().from(topicRecommendQuestion).where(eq(topicRecommendQuestion.topicId, params.topicId));
    if (questions.length) {
        await db.insert(topicRecommendQuestion).values(
            questions.map((question) => ({
                topicId: newTopicId,
                questionType: question.questionType,
                content: question.content,
                options: question.options,
                sortOrder: question.sortOrder,
            }))
        );
    }

    return { ok: true as const, id: newTopicId };
}
