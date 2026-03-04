import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { basename } from "node:path";
import { db } from "../../db";
import { class_, experiment, student, submission, task, topic, topicAttachment, topicRecommendQuestion } from "../../db/schema";
import { error, getRouteParam, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { notifyStudentsByClassIds, requirePrimaryTeacher } from "./auth";
import { hasTopicOwnership } from "./topic-guards";

function sanitizeUploadFileName(originalName: string) {
    const fileName = basename(originalName)
        .replace(/[\x00-\x1F\x7F]/g, "")
        .replace(/[\\/]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 120);

    return fileName || "upload.bin";
}

async function requireTopicOwner(topicId: number, teacherId: number) {
    const [row] = await db
        .select({ id: topic.id, status: topic.status })
        .from(topic)
        .where(and(eq(topic.id, topicId), eq(topic.teacherId, teacherId), eq(topic.isDeleted, 0)));
    return row ?? null;
}

async function parseExcelFile(buffer: ArrayBuffer) {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { rows: [], columns: [], rowCount: 0, colCount: 0, preview: [] };
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { rows: [], columns: [], rowCount: 0, colCount: 0, preview: [] };

    const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
    const columns = Object.keys(json[0] ?? {});
    return {
        rows: json,
        columns,
        rowCount: json.length,
        colCount: columns.length,
        preview: json.slice(0, 20),
    };
}

function isRowEmpty(row: Record<string, any>) {
    return Object.values(row).every((v) => `${v ?? ""}`.trim() === "");
}

function getAttachmentType(fileName: string, mimeType: string) {
    const name = fileName.toLowerCase();
    if (mimeType.startsWith("image/") || /(\.png|\.jpg|\.jpeg|\.gif)$/.test(name)) return "image";
    if (mimeType.startsWith("video/") || /(\.mp4|\.webm)$/.test(name)) return "video";
    if (/(\.pdf|\.doc|\.docx|\.ppt|\.pptx)$/.test(name)) return "document";
    return "unknown";
}

const topicRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const rows = await db
            .select({
                id: topic.id,
                name: topic.name,
                description: topic.description,
                status: topic.status,
                dataRows: topic.excelRowCount,
                createdAt: topic.createdAt,
            })
            .from(topic)
            .where(and(eq(topic.teacherId, currentTeacherId), eq(topic.isDeleted, 0)))
            .orderBy(desc(topic.createdAt));

        return json(rows);
    },

    async POST(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const body = await parseBody<{ name: string; description?: string; status?: number }>(req);

        if (!body.name?.trim()) return error("课题名称不能为空", "VALIDATION_ERROR");

        const [result] = await db.insert(topic).values({
            teacherId: currentTeacherId,
            name: body.name.trim(),
            description: body.description ?? "",
            status: body.status ?? 0,
        });

        return json({ id: result.insertId }, 201);
    }
};

const topicItemRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const ownsTopic = await hasTopicOwnership(id, currentTeacherId, requireTopicOwner);
        if (!ownsTopic) return error("课题不存在", "NOT_FOUND", 404);

        const body = await parseBody<{ name?: string; description?: string; status?: number }>(req);

        const updateData: any = {};
        if (body.name !== undefined) updateData.name = body.name;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.status !== undefined) updateData.status = body.status;

        if (Object.keys(updateData).length === 0) return json({ success: true });

        await db.update(topic).set(updateData).where(and(eq(topic.id, id), eq(topic.teacherId, currentTeacherId), eq(topic.isDeleted, 0)));
        return json({ success: true });
    },

    async DELETE(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const ownsTopic = await hasTopicOwnership(id, currentTeacherId, requireTopicOwner);
        if (!ownsTopic) return error("课题不存在", "NOT_FOUND", 404);

        const deletedAt = new Date();
        await db.transaction(async (tx) => {
            await tx
                .update(topic)
                .set({ isDeleted: 1, deletedAt })
                .where(and(eq(topic.id, id), eq(topic.teacherId, currentTeacherId), eq(topic.isDeleted, 0)));

            await tx
                .update(task)
                .set({ deletedAt })
                .where(and(eq(task.topicId, id), isNull(task.deletedAt)));
        });
        return json({ success: true });
    }
};

const topicDetailRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const id = Number(getRouteParam(req, "id"));

        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const [topicInfo] = await db.select().from(topic).where(eq(topic.id, id));

        const attachments = await db.select().from(topicAttachment).where(eq(topicAttachment.topicId, id)).orderBy(desc(topicAttachment.createdAt));
        const recommendQuestions = await db
            .select()
            .from(topicRecommendQuestion)
            .where(eq(topicRecommendQuestion.topicId, id))
            .orderBy(asc(topicRecommendQuestion.sortOrder));

        let excelInfo = null as null | { columns: string[]; preview: any[] };
        if (topicInfo?.excelFilePath) {
            try {
                const buffer = await Bun.file(`${process.cwd()}${topicInfo.excelFilePath}`).arrayBuffer();
                const parsed = await parseExcelFile(buffer);
                excelInfo = { columns: parsed.columns, preview: parsed.preview };
            } catch {
                excelInfo = null;
            }
        }

        return json({ topic: topicInfo, attachments, recommendQuestions, excelInfo });
    }
};

const topicExcelUploadRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1) return error("已发布课题不能修改数据", "FORBIDDEN", 403);

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) return error("请选择文件", "VALIDATION_ERROR", 400);

        const buffer = await file.arrayBuffer();
        const parsed = await parseExcelFile(buffer);
        if (!parsed.columns.length) return error("Excel表头为空", "VALIDATION_ERROR", 400);
        if (parsed.rowCount < 1 || parsed.rowCount > 100000) return error("数据行数需在1-100000之间", "VALIDATION_ERROR", 400);
        if (parsed.colCount < 2 || parsed.colCount > 50) return error("数据列数需在2-50之间", "VALIDATION_ERROR", 400);

        const columnSet = new Set(parsed.columns);
        if (columnSet.size !== parsed.columns.length) return error("表头存在重复列名", "VALIDATION_ERROR", 400);
        if (parsed.rows.some((row) => isRowEmpty(row))) return error("存在完全空白的行", "VALIDATION_ERROR", 400);

        const fileName = `${Date.now()}_${sanitizeUploadFileName(file.name)}`;
        const filePath = `/storage/uploads/${fileName}`;
        await Bun.write(`${process.cwd()}${filePath}`, buffer);

        await db.update(topic).set({ excelFilePath: filePath, excelRowCount: parsed.rowCount }).where(eq(topic.id, id));

        return json({ filePath, rowCount: parsed.rowCount, colCount: parsed.colCount, columns: parsed.columns, preview: parsed.preview });
    }
};

const topicFieldMappingRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1) return error("已发布课题不能修改字段映射", "FORBIDDEN", 403);

        const body = await parseBody<{ fieldMapping: any }>(req);
        if (!body.fieldMapping) return error("字段映射不能为空", "VALIDATION_ERROR", 400);

        const mapping = body.fieldMapping as { identifier?: string; stratified?: string[]; numeric?: string[]; others?: string[] };
        const identifier = mapping.identifier;
        const stratified = mapping.stratified ?? [];
        const numeric = mapping.numeric ?? [];
        const others = mapping.others ?? [];

        const uniqueFields = new Set([identifier, ...stratified, ...numeric, ...others].filter(Boolean));
        if (!identifier) return error("必须选择1个标识符字段", "VALIDATION_ERROR", 400);
        if (stratified.length < 1) return error("至少选择1个分层变量", "VALIDATION_ERROR", 400);
        if (numeric.length < 1) return error("至少选择1个数值变量", "VALIDATION_ERROR", 400);
        if (uniqueFields.size < 3) return error("至少选择3个字段", "VALIDATION_ERROR", 400);

        const [topicInfo] = await db.select({ excelFilePath: topic.excelFilePath }).from(topic).where(eq(topic.id, id));
        if (!topicInfo?.excelFilePath) return error("请先上传总体数据", "VALIDATION_ERROR", 400);

        const buffer = await Bun.file(`${process.cwd()}${topicInfo.excelFilePath}`).arrayBuffer();
        const parsed = await parseExcelFile(buffer);

        for (const field of stratified) {
            const set = new Set<string>();
            for (const row of parsed.rows) {
                const val = String(row[field] ?? "").trim();
                if (val) set.add(val);
            }
            if (set.size > 20) return error(`分层变量 ${field} 的唯一值数量超过20`, "VALIDATION_ERROR", 400);
        }

        await db.update(topic).set({ fieldMapping: body.fieldMapping }).where(eq(topic.id, id));
        return json({ success: true });
    }
};

const topicAttachmentRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) return error("请选择文件", "VALIDATION_ERROR", 400);

        const [countRow] = await db.select({ count: count() }).from(topicAttachment).where(eq(topicAttachment.topicId, id));
        if ((countRow?.count ?? 0) >= 20) return error("附件数量已达上限", "VALIDATION_ERROR", 400);

        const attachmentType = getAttachmentType(file.name, file.type || "");
        const sizeLimit =
            attachmentType === "image"
                ? 10 * 1024 * 1024
                : attachmentType === "video"
                    ? 200 * 1024 * 1024
                    : attachmentType === "document"
                        ? 50 * 1024 * 1024
                        : 0;

        if (!sizeLimit) return error("不支持的文件类型", "VALIDATION_ERROR", 400);
        if (file.size > sizeLimit) return error("文件大小超过限制", "VALIDATION_ERROR", 400);

        const buffer = await file.arrayBuffer();
        const fileName = `${Date.now()}_${sanitizeUploadFileName(file.name)}`;
        const filePath = `/storage/uploads/${fileName}`;
        await Bun.write(`${process.cwd()}${filePath}`, buffer);

        const [result] = await db.insert(topicAttachment).values({
            topicId: id,
            fileName: file.name,
            filePath,
            fileType: file.type || "unknown",
            fileSize: file.size,
        });

        return json({ id: result.insertId, filePath });
    }
};

const topicAttachmentDeleteRoutes: RouteDefinition = {
    async DELETE(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const topicId = Number(getRouteParam(req, "id"));
        const attachmentId = Number(getRouteParam(req, "attachmentId"));
        if (isNaN(topicId) || isNaN(attachmentId)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(topicId, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        await db.delete(topicAttachment).where(and(eq(topicAttachment.id, attachmentId), eq(topicAttachment.topicId, topicId)));
        return json({ success: true });
    }
};

const topicRecommendQuestionRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const body = await parseBody<{ items: Array<{ questionType: number; content: string; options?: any; sortOrder?: number }> }>(req);
        const items = body.items ?? [];

        if (items.length > 30) return error("推荐题目数量不能超过30", "VALIDATION_ERROR", 400);

        for (const item of items) {
            const content = (item.content ?? "").trim();
            if (!content || content.length > 500) return error("题目内容长度需在1-500字", "VALIDATION_ERROR", 400);

            if (item.questionType === 2 || item.questionType === 3) {
                const raw = typeof item.options === "string" ? item.options : "";
                const options = raw.split(",").map((o) => o.trim()).filter(Boolean);
                if (options.length < 2 || options.length > 10) return error("选项数量需在2-10之间", "VALIDATION_ERROR", 400);
                if (options.some((o) => o.length > 200)) return error("选项内容长度不能超过200", "VALIDATION_ERROR", 400);
            }
        }

        await db.transaction(async (tx) => {
            await tx.delete(topicRecommendQuestion).where(eq(topicRecommendQuestion.topicId, id));
            for (const item of items) {
                await tx.insert(topicRecommendQuestion).values({
                    topicId: id,
                    questionType: item.questionType,
                    content: item.content,
                    options: item.options ?? null,
                    sortOrder: item.sortOrder ?? 0,
                });
            }
        });

        return json({ success: true });
    }
};

const topicWeightRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const body = await parseBody<{ weightConfig: { questionnaire: number; process: number; report: number } }>(req);
        const weightConfig = body.weightConfig;
        if (!weightConfig) return error("评分权重不能为空", "VALIDATION_ERROR", 400);
        const sum = (weightConfig.questionnaire ?? 0) + (weightConfig.process ?? 0) + (weightConfig.report ?? 0);
        if (sum !== 100) return error("评分权重总和必须等于100", "VALIDATION_ERROR", 400);

        await db.update(topic).set({ weightConfig }).where(eq(topic.id, id));
        return json({ success: true });
    }
};

const topicCopyRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const [srcTopic] = await db.select().from(topic).where(eq(topic.id, id));
        if (!srcTopic) return error("课题不存在", "NOT_FOUND", 404);

        const [result] = await db.insert(topic).values({
            teacherId: currentTeacherId,
            name: `${srcTopic.name} (副本)`,
            description: srcTopic.description ?? "",
            excelFilePath: srcTopic.excelFilePath,
            excelRowCount: srcTopic.excelRowCount,
            fieldMapping: srcTopic.fieldMapping,
            weightConfig: srcTopic.weightConfig,
            status: 0,
        });

        const newTopicId = Number(result.insertId);

        const attachments = await db.select().from(topicAttachment).where(eq(topicAttachment.topicId, id));
        if (attachments.length) {
            await db.insert(topicAttachment).values(
                attachments.map((a) => ({
                    topicId: newTopicId,
                    fileName: a.fileName,
                    filePath: a.filePath,
                    fileType: a.fileType,
                    fileSize: a.fileSize,
                }))
            );
        }

        const questions = await db.select().from(topicRecommendQuestion).where(eq(topicRecommendQuestion.topicId, id));
        if (questions.length) {
            await db.insert(topicRecommendQuestion).values(
                questions.map((q) => ({
                    topicId: newTopicId,
                    questionType: q.questionType,
                    content: q.content,
                    options: q.options,
                    sortOrder: q.sortOrder,
                }))
            );
        }

        return json({ id: newTopicId });
    }
};

const taskRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const rows = await db
            .select({
                id: task.id,
                topic: topic.name,
                className: class_.name,
                publishedAt: task.openTime,
                deadline: task.deadline,
                total: count(student.id),
                completed: sql<number>`(
                    SELECT COUNT(*)
                    FROM submission s
                    INNER JOIN experiment e ON s.experiment_id = e.id
                    WHERE e.task_id = ${task.id} AND s.status IN (1, 2, 3)
                )`,
                pending: sql<number>`(
                    SELECT COUNT(*)
                    FROM submission s
                    INNER JOIN experiment e ON s.experiment_id = e.id
                    WHERE e.task_id = ${task.id} AND s.status = 1
                )`,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .leftJoin(student, eq(student.classId, class_.id))
            .where(eq(class_.teacherId, currentTeacherId))
            .groupBy(task.id)
            .orderBy(desc(task.createdAt));

        return json(rows);
    },

    async POST(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const body = await parseBody<{ topicId: number; classIds: number[]; deadline?: string }>(req);

        if (!body.topicId || !body.classIds?.length) return error("请选择课题和班级", "VALIDATION_ERROR");

        const [topicRow] = await db.select({ id: topic.id }).from(topic).where(and(eq(topic.id, body.topicId), eq(topic.teacherId, currentTeacherId)));
        if (!topicRow) return error("无权限使用该课题", "FORBIDDEN", 403);

        const allowedClasses = await db
            .select({ id: class_.id })
            .from(class_)
            .where(and(eq(class_.teacherId, currentTeacherId), sql`${class_.id} IN (${sql.join(body.classIds, sql`, `)})`));

        if (allowedClasses.length !== body.classIds.length) return error("存在无权限的班级", "FORBIDDEN", 403);

        const deadlineDate = body.deadline ? new Date(body.deadline) : null;
        if (deadlineDate && Number.isNaN(deadlineDate.getTime())) return error("截止时间无效", "VALIDATION_ERROR", 400);
        if (deadlineDate && deadlineDate <= new Date()) return error("截止时间必须晚于当前时间", "VALIDATION_ERROR", 400);

        const existingRows = await db
            .select({ classId: task.classId })
            .from(task)
            .where(and(eq(task.topicId, body.topicId), sql`${task.classId} IN (${sql.join(body.classIds, sql`, `)})`, isNull(task.deletedAt)));

        const existingClassIds = new Set(existingRows.map((r) => r.classId));
        const toInsert = body.classIds.filter((cid) => !existingClassIds.has(cid));

        for (const cid of toInsert) {
            await db.insert(task).values({ topicId: body.topicId, classId: cid, openTime: new Date(), deadline: deadlineDate });
        }

        if (toInsert.length > 0) {
            const [topicNamed] = await db.select({ name: topic.name }).from(topic).where(eq(topic.id, body.topicId));
            const deadlineText = deadlineDate ? deadlineDate.toLocaleString("zh-CN") : "无限制";
            await notifyStudentsByClassIds(toInsert, {
                type: "TASK_PUBLISHED",
                title: "新任务已发布",
                content: `教师发布了新任务「${topicNamed?.name ?? "未命名课题"}」，截止时间：${deadlineText}`,
                relatedType: "topic",
                relatedId: body.topicId,
            });
        }

        return json({ success: true, skipped: Array.from(existingClassIds) }, 201);
    }
};

const taskExtendRoutes: RouteDefinition = {
    async PUT(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const taskId = Number(getRouteParam(req, "id"));
        if (isNaN(taskId)) return error("Invalid ID", "INVALID_ID");

        const body = await parseBody<{ deadline: string }>(req);
        if (!body.deadline) return error("请输入截止时间", "VALIDATION_ERROR");
        const newDeadline = new Date(body.deadline);
        if (Number.isNaN(newDeadline.getTime())) return error("截止时间无效", "VALIDATION_ERROR");

        const [row] = await db
            .select({ id: task.id, classId: task.classId, deadline: task.deadline })
            .from(task)
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(eq(task.id, taskId), eq(class_.teacherId, currentTeacherId)));

        if (!row) return error("任务不存在", "NOT_FOUND", 404);
        if (row.deadline && new Date(row.deadline) >= newDeadline) return error("新截止时间必须晚于原截止时间", "VALIDATION_ERROR", 400);

        await db.update(task).set({ deadline: newDeadline }).where(eq(task.id, taskId));
        await notifyStudentsByClassIds([row.classId], {
            type: "TASK_EXTENDED",
            title: "截止时间已延长",
            content: `任务截止时间已延长至 ${newDeadline.toLocaleString("zh-CN")}`,
            relatedType: "task",
            relatedId: taskId,
        });
        return json({ success: true });
    }
};

const taskProgressRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requirePrimaryTeacher(req);
        if (auth.error) return auth.error;
        const currentTeacherId = auth.teacherId!;
        const taskId = Number(getRouteParam(req, "id"));
        if (isNaN(taskId)) return error("Invalid ID", "INVALID_ID");

        const [taskRow] = await db
            .select({
                id: task.id,
                topicName: topic.name,
                className: class_.name,
                classId: task.classId,
                deadline: task.deadline,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(eq(task.id, taskId), eq(class_.teacherId, currentTeacherId)));

        if (!taskRow) return error("任务不存在", "NOT_FOUND", 404);

        // Use subquery to get the latest submission per experiment to avoid duplicate rows
        const latestSub = db
            .select({
                experimentId: submission.experimentId,
                status: sql<number>`MAX(${submission.status})`.as("latest_status"),
            })
            .from(submission)
            .groupBy(submission.experimentId)
            .as("latest_sub");

        const students = await db
            .select({
                id: student.id,
                studentId: student.studentId,
                name: student.name,
                experimentId: experiment.id,
                currentStage: experiment.currentStage,
                experimentStatus: experiment.status,
                submissionStatus: latestSub.status,
                lastActivity: experiment.updatedAt,
            })
            .from(student)
            .leftJoin(experiment, and(eq(experiment.studentId, student.id), eq(experiment.taskId, taskId)))
            .leftJoin(latestSub, eq(latestSub.experimentId, experiment.id))
            .where(eq(student.classId, taskRow.classId))
            .orderBy(asc(student.studentId));

        const counts = { not_started: 0, stage1: 0, stage2: 0, stage3: 0, stage4: 0, submitted: 0, graded: 0, rejected: 0 };
        const studentList = students.map((s) => {
            let status = "not_started";
            let stage: number | null = null;

            if (!s.experimentId) {
                status = "not_started";
                counts.not_started++;
            } else if (s.submissionStatus === 2) {
                status = "graded";
                counts.graded++;
            } else if (s.submissionStatus === 3) {
                status = "rejected";
                counts.rejected++;
            } else if (s.submissionStatus === 1) {
                status = "submitted";
                counts.submitted++;
            } else {
                stage = s.currentStage ?? 0;
                if (stage <= 1) { status = "stage1"; counts.stage1++; }
                else if (stage === 2) { status = "stage2"; counts.stage2++; }
                else if (stage === 3) { status = "stage3"; counts.stage3++; }
                else { status = "stage4"; counts.stage4++; }
            }

            return {
                studentId: s.studentId,
                name: s.name,
                status,
                stage,
                lastActivity: s.lastActivity,
            };
        });

        return json({
            task: { topicName: taskRow.topicName, className: taskRow.className, deadline: taskRow.deadline },
            counts,
            students: studentList,
        });
    }
};

export {
    taskExtendRoutes,
    taskProgressRoutes,
    taskRoutes,
    topicAttachmentDeleteRoutes,
    topicAttachmentRoutes,
    topicCopyRoutes,
    topicDetailRoutes,
    topicExcelUploadRoutes,
    topicFieldMappingRoutes,
    topicItemRoutes,
    topicRecommendQuestionRoutes,
    topicRoutes,
    topicWeightRoutes,
};
