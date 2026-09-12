import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { task, topic, topicAttachment } from "../../db/schema";
import { acquireStorageMutationLock } from "../../db/storage-mutation-lock";
import { resolveAnalysisTarget, retitleGeneratedStudyContract } from "../../lib/analysis-target";
import { hasSameSamplingMapping } from "./sampling-mapping";
import { buildDefaultSamplingPolicy, parseSamplingPolicy, validateSamplingPolicy } from "../../lib/sampling-policy";
import { validateSpreadsheetUploadFile } from "../../lib/spreadsheet";
import { createStorageUploadPath, deleteStorageFileIfExists, resolveStoragePath, writeStorageFile } from "../../server/storage-files";
import { parseExcelFile, sanitizeUploadFileName } from "./file-utils";
import { CsvEncodingError, normalizeSpreadsheetUpload } from "../../lib/csv-encoding";
import { deleteTopicStorageFileIfUnreferenced } from "./storage-cleanup";
import { getPpsEligibleNumericFields, parseTopicFieldMapping } from "@/domain/statistics/population";
import { canonicalizeRichTextHtmlForStorage } from "../../server/rich-text";
import { deleteAuditEventsForEntities } from "../../server/audit-event";
import { dictionaryDatasetRevision, readStoredVariableDictionary } from "../../server/variable-dictionary";
import {
    validateMappedPopulationData,
    validateParsedExcelUpload,
    validateTopicPublishReadiness,
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
        return fail("实验模板描述格式无效");
    }
    if (params.status !== undefined && params.status !== 0 && params.status !== 1) {
        return fail("实验模板状态无效");
    }
    if (params.status === 1) {
        return fail("实验模板需先上传总体数据后才能发布");
    }

    const [created] = await db
        .insert(topic)
        .values({
            teacherId: params.teacherId,
            name: params.name.trim(),
            description: canonicalizeRichTextHtmlForStorage(params.description),
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
        return fail("实验模板状态无效");
    }
    if (params.body.description !== undefined && typeof params.body.description !== "string") {
        return fail("实验模板描述格式无效");
    }
    const updateData: Record<string, unknown> = {};
    if (params.body.name !== undefined) {
        const nameError = validateTopicName(params.body.name);
        if (nameError) return fail(nameError);
        updateData.name = params.body.name.trim();
    }
    if (params.body.description !== undefined) {
        updateData.description = canonicalizeRichTextHtmlForStorage(params.body.description);
    }
    if (params.body.status !== undefined) updateData.status = params.body.status;

    if (Object.keys(updateData).length === 0) {
        return { ok: true as const };
    }

    updateData.updatedAt = new Date();

    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [topicInfo] = await tx
            .select({
                name: topic.name,
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
                variableDictionary: topic.variableDictionary,
                variableDictionaryRevision: topic.variableDictionaryRevision,
                samplingPolicy: topic.samplingPolicy,
                weightConfig: topic.weightConfig,
            })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
        if (!topicInfo) return fail("实验模板不存在", "NOT_FOUND", 404);
        const [taskReference] = await tx
            .select({ id: task.id })
            .from(task)
            .where(eq(task.topicId, params.topicId))
            .limit(1);
        if (taskReference) {
            return fail(
                "实验模板已分配任务，内容不能再修改；如需调整请复制为新模板",
                "TOPIC_ASSIGNED",
                409,
            );
        }

        if (typeof updateData.name === "string" && updateData.name !== topicInfo.name) {
            const renamedMapping = retitleGeneratedStudyContract(
                topicInfo.fieldMapping,
                topicInfo.name,
                updateData.name,
            );
            if (renamedMapping !== topicInfo.fieldMapping) updateData.fieldMapping = renamedMapping;
        }

        if (params.body.status === 1) {
            const effectiveMapping = updateData.fieldMapping ?? topicInfo.fieldMapping;
            const readinessInput = {
                excelFilePath: topicInfo.excelFilePath,
                fieldMapping: effectiveMapping as Record<string, unknown> | string | null | undefined,
                samplingPolicy: topicInfo.samplingPolicy,
                weightConfig: topicInfo.weightConfig as Record<string, unknown> | string | null | undefined,
            };
            // Cheap checks first so a missing population still reports as such.
            const publishReadinessError = validateTopicPublishReadiness(readinessInput);
            if (publishReadinessError) return fail(publishReadinessError);
            const mapping = parseTopicFieldMapping(effectiveMapping);
            if (!mapping || !topicInfo.excelFilePath) return fail("实验模板字段映射无效");
            const buffer = await Bun.file(resolveStoragePath(topicInfo.excelFilePath)).arrayBuffer();
            const dictionary = readStoredVariableDictionary(topicInfo.variableDictionary, topicInfo.variableDictionaryRevision);
            if (!dictionary.ok) return dictionary;
            if (dictionary.value && dictionary.value.datasetRevision !== dictionaryDatasetRevision(buffer, topicInfo.excelFilePath, effectiveMapping)) {
                return fail("总体数据或字段配置已改变，请重新确认变量字典", "DATASET_CHANGED", 409);
            }
            const parsed = await parseExcelFile(buffer, topicInfo.excelFilePath, {
                includeColumnValues: false,
                numericFields: mapping.numeric ?? [],
            });
            // Then re-check with the actual rows: publishing must not ship a
            // required PPS that this population cannot execute.
            const eligibilityError = validateTopicPublishReadiness({ ...readinessInput, rows: parsed.rows });
            if (eligibilityError) return fail(eligibilityError);
            const populationError = validateMappedPopulationData(parsed, mapping);
            if (populationError) return fail(populationError);
        }

        const [updated] = await tx
            .update(topic)
            .set(updateData)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)))
            .returning({ id: topic.id });
        return updated ? { ok: true as const } : fail("实验模板不存在", "NOT_FOUND", 404);
    });
}

const assignedTopicDeletion = Symbol("assigned-topic-deletion");

export async function deleteTeacherTopic(params: { teacherId: number; topicId: number }) {
    let deletion: { cleanupPaths: string[] } | null;
    try {
        deletion = await db.transaction(async (tx) => {
            await acquireStorageMutationLock(tx);
            const [topicRow] = await tx
                .select({ id: topic.id, excelFilePath: topic.excelFilePath })
                .from(topic)
                .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)))
                .for("update");
            if (!topicRow) return null;

            const attachmentRows = await tx
                .select({ id: topicAttachment.id, filePath: topicAttachment.filePath })
                .from(topicAttachment)
                .where(eq(topicAttachment.topicId, params.topicId));
            const [taskReference] = await tx
                .select({ id: task.id })
                .from(task)
                .where(eq(task.topicId, params.topicId))
                .limit(1);

            if (taskReference) throw assignedTopicDeletion;

            const [deletedTopic] = await tx
                .delete(topic)
                .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)))
                .returning({ id: topic.id });
            if (!deletedTopic) return null;
            await deleteAuditEventsForEntities(tx, "topic_attachment", attachmentRows.map((row) => row.id));
            await deleteAuditEventsForEntities(tx, "topic", [params.topicId]);

            return {
                cleanupPaths: [topicRow.excelFilePath, ...attachmentRows.map((row) => row.filePath)].filter(
                    (filePath): filePath is string => Boolean(filePath),
                ),
            };
        });
    } catch (error) {
        if (error === assignedTopicDeletion) {
            return fail("已分配实验任务的模板不能删除", "TOPIC_ASSIGNED", 403);
        }
        throw error;
    }

    if (!deletion) {
        return fail("实验模板不存在", "NOT_FOUND", 404);
    }

    await Promise.all(deletion.cleanupPaths.map(async (filePath) => {
        await deleteTopicStorageFileIfUnreferenced(filePath).catch((error) => {
            console.warn(`已删除实验模板的存储文件清理失败：${filePath}`, error);
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

    let buffer: ArrayBuffer;
    let parsed: Awaited<ReturnType<typeof parseExcelFile>>;
    try {
        buffer = normalizeSpreadsheetUpload(await params.file.arrayBuffer(), params.file.name);
        const normalizedError = validateSpreadsheetUploadFile({ name: params.file.name, size: buffer.byteLength });
        if (normalizedError) return fail(normalizedError.message, normalizedError.code, normalizedError.status);
        parsed = await parseExcelFile(buffer, params.file.name);
    } catch (error) {
        return fail(error instanceof CsvEncodingError ? error.message : "无法读取表格文件，请上传有效的 CSV 或 XLSX 文件", "INVALID_FILE");
    }
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
                .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
            if (!currentTopic) return fail("实验模板不存在", "NOT_FOUND", 404);
            const [taskReference] = await tx.select({ id: task.id }).from(task).where(eq(task.topicId, params.topicId)).limit(1);
            if (currentTopic.status === 1 || taskReference) {
                return fail("已发布或已分配任务的实验模板不能修改总体数据", "FORBIDDEN", 403);
            }

            await writeStorageFile(filePath, buffer);
            const [updated] = await tx
                .update(topic)
                .set({
                    excelFilePath: filePath,
                    excelRowCount: parsed.rowCount,
                    fieldMapping: null,
                    variableDictionary: null,
                    variableDictionaryRevision: sql`${topic.variableDictionaryRevision} + 1`,
                    updatedAt: new Date(),
                })
                .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)))
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
        columnValuesTruncated: parsed.columnValuesTruncated,
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
        studyContract?: unknown;
    };
}) {
    const mappingError = validateTopicFieldMappingConfig(params.fieldMapping);
    if (mappingError) return fail(mappingError);

    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [topicInfo] = await tx
            .select({ excelFilePath: topic.excelFilePath, status: topic.status, fieldMapping: topic.fieldMapping, samplingPolicy: topic.samplingPolicy })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
        if (!topicInfo) return fail("实验模板不存在", "NOT_FOUND", 404);
        const [taskReference] = await tx.select({ id: task.id }).from(task).where(eq(task.topicId, params.topicId)).limit(1);
        if (topicInfo.status === 1 || taskReference) {
            return fail("已发布或已分配任务的实验模板不能修改研究目标与字段", "FORBIDDEN", 403);
        }
        if (!topicInfo.excelFilePath) return fail("请先上传总体数据");

        const buffer = await Bun.file(resolveStoragePath(topicInfo.excelFilePath)).arrayBuffer();
        const parsed = await parseExcelFile(buffer, topicInfo.excelFilePath, {
            includeColumnValues: false,
            numericFields: params.fieldMapping.numeric ?? [],
        });
        const populationError = validateMappedPopulationData(parsed, params.fieldMapping);
        if (populationError) return fail(populationError);

        const resolvedTarget = resolveAnalysisTarget(params.fieldMapping);
        const targetField = resolvedTarget?.inferred ? undefined : resolvedTarget?.target.field;
        const ppsEnabled = getPpsEligibleNumericFields(
            parsed.rows,
            params.fieldMapping.numeric ?? [],
        ).some((field) => field !== targetField);
        const stratifiedEnabled = (params.fieldMapping.stratified?.length ?? 0) > 0;
        const currentPolicy = parseSamplingPolicy(topicInfo.samplingPolicy);
        const preservePolicy = hasSameSamplingMapping(topicInfo.fieldMapping, params.fieldMapping)
            && currentPolicy !== null && validateSamplingPolicy(currentPolicy) === null
            && (ppsEnabled || currentPolicy.methods.pps === "disabled")
            && (stratifiedEnabled || currentPolicy.methods.stratified === "disabled");

        const [updated] = await tx
            .update(topic)
            .set({
                fieldMapping: params.fieldMapping,
                // Equivalent saves/title edits retain confirmed metadata; changed roles
                // or targets require explicit re-confirmation against the new mapping.
                ...(!hasSameSamplingMapping(topicInfo.fieldMapping, params.fieldMapping) ? {
                    variableDictionary: null,
                    variableDictionaryRevision: sql`${topic.variableDictionaryRevision} + 1`,
                } : {}),
                // Navigation through the wizard must not overwrite an existing
                // policy. Replaced files clear fieldMapping, so they still reset.
                ...(!preservePolicy ? {
                    samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled, stratifiedEnabled }),
                } : {}),
                updatedAt: new Date(),
            })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)))
            .returning({ id: topic.id });
        return updated ? { ok: true as const } : fail("实验模板不存在", "NOT_FOUND", 404);
    });
}

export async function updateTopicSamplingPolicy(params: {
    teacherId: number;
    topicId: number;
    samplingPolicy: unknown;
}) {
    const policyError = validateSamplingPolicy(params.samplingPolicy);
    if (policyError) return fail(policyError);
    const samplingPolicy = parseSamplingPolicy(params.samplingPolicy)!;

    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [topicInfo] = await tx
            .select({
                status: topic.status,
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
            })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
        if (!topicInfo) return fail("实验模板不存在", "NOT_FOUND", 404);
        const [taskReference] = await tx.select({ id: task.id }).from(task).where(eq(task.topicId, params.topicId)).limit(1);
        if (topicInfo.status === 1 || taskReference) {
            return fail("已发布或已分配实验任务的模板不能修改抽样策略", "FORBIDDEN", 403);
        }
        if (!topicInfo.excelFilePath || !topicInfo.fieldMapping) {
            return fail("请先上传总体数据并完成研究目标与字段配置");
        }

        if (samplingPolicy.methods.pps !== "disabled") {
            const buffer = await Bun.file(resolveStoragePath(topicInfo.excelFilePath)).arrayBuffer();
            const mapping = parseTopicFieldMapping(topicInfo.fieldMapping);
            const parsed = await parseExcelFile(buffer, topicInfo.excelFilePath, { numericFields: mapping?.numeric ?? [] });
            const resolvedTarget = resolveAnalysisTarget(topicInfo.fieldMapping);
            const targetField = resolvedTarget?.inferred ? undefined : resolvedTarget?.target.field;
            const eligible = getPpsEligibleNumericFields(parsed.rows, mapping?.numeric ?? [])
                .filter((field) => field !== targetField);
            if (eligible.length === 0) {
                return fail("当前总体没有合格的 PPS 规模变量，请将 PPS 设为不适用");
            }
        }
        const mapping = parseTopicFieldMapping(topicInfo.fieldMapping);
        if (samplingPolicy.methods.stratified !== "disabled" && (mapping?.stratified?.length ?? 0) === 0) {
            return fail("当前研究没有分层变量，请将分层抽样设为不适用");
        }

        const [updated] = await tx
            .update(topic)
            .set({ samplingPolicy, updatedAt: new Date() })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)))
            .returning({ id: topic.id });
        return updated ? { ok: true as const } : fail("实验模板不存在", "NOT_FOUND", 404);
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
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
        if (!topicInfo) return fail("实验模板不存在", "NOT_FOUND", 404);
        const [taskReference] = await tx.select({ id: task.id }).from(task).where(eq(task.topicId, params.topicId)).limit(1);
        if (topicInfo.status === 1 || taskReference) {
            return fail("已发布或已分配任务的实验模板不能修改评分规则", "FORBIDDEN", 403);
        }
        const [updated] = await tx
            .update(topic)
            .set({ weightConfig: params.weightConfig, updatedAt: new Date() })
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)))
            .returning({ id: topic.id });
        return updated ? { ok: true as const } : fail("实验模板不存在", "NOT_FOUND", 404);
    });
}
