import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { task, topic } from "../../db/schema";
import { parseExcelFile, sanitizeUploadFileName } from "./file-utils";
import {
    validateParsedExcelUpload,
    validateStratifiedValueCardinality,
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

    const [result] = await db.insert(topic).values({
        teacherId: params.teacherId,
        name: params.name.trim(),
        description: params.description ?? "",
        status: params.status ?? 0,
    });

    return { ok: true as const, id: result.insertId };
}

export async function updateTeacherTopicBasics(params: {
    teacherId: number;
    topicId: number;
    body: { name?: string; description?: string; status?: number };
}) {
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

    await db
        .update(topic)
        .set(updateData)
        .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), eq(topic.isDeleted, 0)));

    return { ok: true as const };
}

export async function softDeleteTeacherTopic(params: { teacherId: number; topicId: number }) {
    const deletedAt = new Date();

    await db.transaction(async (tx) => {
        await tx
            .update(topic)
            .set({ isDeleted: 1, deletedAt })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), eq(topic.isDeleted, 0)));

        await tx
            .update(task)
            .set({ deletedAt })
            .where(and(eq(task.topicId, params.topicId), isNull(task.deletedAt)));
    });

    return { ok: true as const };
}

export async function replaceTopicExcelData(params: {
    topicId: number;
    file: File;
}) {
    const buffer = await params.file.arrayBuffer();
    const parsed = await parseExcelFile(buffer);
    const validationError = validateParsedExcelUpload(parsed);
    if (validationError) return fail(validationError);

    const fileName = `${Date.now()}_${sanitizeUploadFileName(params.file.name)}`;
    const filePath = `/storage/uploads/${fileName}`;
    await Bun.write(`${process.cwd()}${filePath}`, buffer);

    await db.update(topic).set({ excelFilePath: filePath, excelRowCount: parsed.rowCount }).where(eq(topic.id, params.topicId));

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

    const buffer = await Bun.file(`${process.cwd()}${topicInfo.excelFilePath}`).arrayBuffer();
    const parsed = await parseExcelFile(buffer);
    const cardinalityError = validateStratifiedValueCardinality(parsed.rows, params.fieldMapping.stratified ?? []);
    if (cardinalityError) return fail(cardinalityError);

    await db.update(topic).set({ fieldMapping: params.fieldMapping }).where(eq(topic.id, params.topicId));
    return { ok: true as const };
}

export async function updateTopicWeightConfig(params: {
    topicId: number;
    weightConfig: { questionnaire: number; process: number; report: number } | null | undefined;
}) {
    const weightError = validateWeightConfig(params.weightConfig);
    if (weightError) return fail(weightError);

    await db.update(topic).set({ weightConfig: params.weightConfig }).where(eq(topic.id, params.topicId));
    return { ok: true as const };
}
