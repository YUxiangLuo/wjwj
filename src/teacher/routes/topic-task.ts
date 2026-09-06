import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { topic, topicAttachment } from "../../db/schema";
import { spreadsheetRequestExceedsLimit } from "../../lib/spreadsheet";
import { buildAttachmentDownloadResponse } from "../../server/attachment-download";
import { error, getPositiveRouteId, json, parseBody, parseFormData } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { requireTopicOwner } from "../topic/access";
import {
    copyTopicWithResources,
    deleteTopicAttachment,
    replaceTopicRecommendQuestions,
    uploadTopicAttachment,
} from "../topic/content-service";
import {
    createTeacherTopic,
    replaceTopicExcelData,
    deleteTeacherTopic,
    updateTeacherTopicBasics,
    updateTopicFieldMapping,
    updateTopicSamplingPolicy,
    updateTopicWeightConfig,
} from "../topic/manage-service";
import {
    getTeacherTaskProgress,
    getTeacherTopicDetail,
    listTeacherTasks,
    listTeacherTopics,
} from "../topic/query-service";
import { deleteTeacherTask, extendTopicTaskDeadline, publishTopicTasks } from "../topic/task-service";
import { getPrimaryTeacherIdOrThrow } from "./auth";

function assignedTopicContentError() {
    return error(
        "实验模板已分配任务，内容不能再修改；如需调整请复制为新模板",
        "TOPIC_ASSIGNED",
        409,
    );
}

function parsePositiveRouteId(req: Request, name = "id") {
    return getPositiveRouteId(req, name);
}

const topicRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        return json(await listTeacherTopics(currentTeacherId));
    },

    async POST(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const body = await parseBody<{ name: string; description?: string; status?: number }>(req);
        const createResult = await createTeacherTopic({
            teacherId: currentTeacherId,
            name: body.name,
            description: body.description,
            status: body.status,
        });
        if (!createResult.ok) return error(createResult.message, createResult.code, createResult.status);

        return json({ id: createResult.id }, 201);
    }
};

const topicItemRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);
        if (topicRow.hasTasks) return assignedTopicContentError();

        const body = await parseBody<{ name?: string; description?: string; status?: number }>(req);
        const updateResult = await updateTeacherTopicBasics({
            teacherId: currentTeacherId,
            topicId: id,
            body,
        });
        if (!updateResult.ok) return error(updateResult.message, updateResult.code, updateResult.status);

        return json({ success: true });
    },

    async DELETE(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);

        const deleteResult = await deleteTeacherTopic({ teacherId: currentTeacherId, topicId: id });
        if (!deleteResult.ok) return error(deleteResult.message, deleteResult.code, deleteResult.status);
        return json({ success: true });
    }
};

const topicDetailRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);

        return json(await getTeacherTopicDetail(id));
    }
};

const topicExcelUploadRoutes: RouteDefinition = {
    async POST(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1 || topicRow.hasTasks) {
            return error("已发布或已分配任务的实验模板不能修改总体数据", "FORBIDDEN", 403);
        }
        if (spreadsheetRequestExceedsLimit(req)) {
            return error("表格文件不能超过20 MiB", "FILE_TOO_LARGE", 413);
        }

        const formData = await parseFormData(req);
        const file = formData.get("file");
        if (!file || !(file instanceof File)) return error("请选择文件", "VALIDATION_ERROR", 400);
        const replaceResult = await replaceTopicExcelData({
            teacherId: currentTeacherId,
            topicId: id,
            file,
        });
        if (!replaceResult.ok) return error(replaceResult.message, replaceResult.code, replaceResult.status);

        return json({
            rowCount: replaceResult.rowCount,
            colCount: replaceResult.colCount,
            columns: replaceResult.columns,
            preview: replaceResult.preview,
            columnValues: replaceResult.columnValues,
            columnValuesTruncated: replaceResult.columnValuesTruncated,
        });
    }
};

const topicFieldMappingRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1 || topicRow.hasTasks) {
            return error("已发布或已分配任务的实验模板不能修改研究目标与字段", "FORBIDDEN", 403);
        }

        const body = await parseBody<{ fieldMapping: any }>(req);
        const mappingResult = await updateTopicFieldMapping({
            teacherId: currentTeacherId,
            topicId: id,
            fieldMapping: body.fieldMapping ?? {},
        });
        if (!mappingResult.ok) return error(mappingResult.message, mappingResult.code, mappingResult.status);

        return json({ success: true });
    }
};

const topicSamplingPolicyRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1 || topicRow.hasTasks) {
            return error("已发布或已分配实验任务的模板不能修改抽样策略", "FORBIDDEN", 403);
        }

        const body = await parseBody<{ samplingPolicy?: unknown }>(req);
        const result = await updateTopicSamplingPolicy({
            teacherId: currentTeacherId,
            topicId: id,
            samplingPolicy: body.samplingPolicy,
        });
        if (!result.ok) return error(result.message, result.code, result.status);
        return json({ success: true });
    },
};

const topicAttachmentRoutes: RouteDefinition = {
    async POST(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);
        if (topicRow.hasTasks) return assignedTopicContentError();

        const formData = await parseFormData(req);
        const file = formData.get("file");
        if (!file || !(file instanceof File)) return error("请选择文件", "VALIDATION_ERROR", 400);
        const uploadResult = await uploadTopicAttachment({ teacherId: currentTeacherId, topicId: id, file });
        if (!uploadResult.ok) return error(uploadResult.message, uploadResult.code, uploadResult.status);

        return json({ id: uploadResult.id });
    }
};

const topicAttachmentDownloadRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const topicId = parsePositiveRouteId(req);
        const attachmentId = parsePositiveRouteId(req, "attachmentId");
        if (!topicId || !attachmentId) {
            return error("Invalid ID", "INVALID_ID");
        }

        const [attachment] = await db
            .select({ fileName: topicAttachment.fileName, filePath: topicAttachment.filePath })
            .from(topicAttachment)
            .innerJoin(topic, eq(topicAttachment.topicId, topic.id))
            .where(and(
                eq(topicAttachment.id, attachmentId),
                eq(topicAttachment.topicId, topicId),
                eq(topic.teacherId, currentTeacherId),
            ));
        if (!attachment) return error("附件不存在", "NOT_FOUND", 404);

        return buildAttachmentDownloadResponse({
            request: req,
            fileName: attachment.fileName,
            filePath: attachment.filePath,
        });
    },
};

const topicAttachmentDeleteRoutes: RouteDefinition = {
    async DELETE(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const topicId = parsePositiveRouteId(req);
        const attachmentId = parsePositiveRouteId(req, "attachmentId");
        if (!topicId || !attachmentId) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(topicId, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);
        if (topicRow.hasTasks) return assignedTopicContentError();

        const deleteResult = await deleteTopicAttachment({ teacherId: currentTeacherId, topicId, attachmentId });
        if (!deleteResult.ok) return error(deleteResult.message, deleteResult.code, deleteResult.status);
        return json({ success: true });
    }
};

const topicRecommendQuestionRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);
        if (topicRow.hasTasks) return assignedTopicContentError();

        const body = await parseBody<{ items?: unknown }>(req);
        const replaceResult = await replaceTopicRecommendQuestions({ teacherId: currentTeacherId, topicId: id, items: body.items });
        if (!replaceResult.ok) return error(replaceResult.message, replaceResult.code, replaceResult.status);

        return json({ success: true });
    }
};

const topicWeightRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1 || topicRow.hasTasks) {
            return error("已发布或已分配任务的实验模板不能修改评分规则", "FORBIDDEN", 403);
        }

        const body = await parseBody<{ weightConfig: { questionnaire: number; process: number; report: number } }>(req);
        const weightResult = await updateTopicWeightConfig({
            teacherId: currentTeacherId,
            topicId: id,
            weightConfig: body.weightConfig,
        });
        if (!weightResult.ok) return error(weightResult.message, weightResult.code, weightResult.status);

        return json({ success: true });
    }
};

const topicCopyRoutes: RouteDefinition = {
    async POST(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = parsePositiveRouteId(req);
        if (!id) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("实验模板不存在", "NOT_FOUND", 404);
        const copyResult = await copyTopicWithResources({ teacherId: currentTeacherId, topicId: id });
        if (!copyResult.ok) return error(copyResult.message, copyResult.code, copyResult.status);

        return json({ id: copyResult.id });
    }
};

const taskRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        return json(await listTeacherTasks(currentTeacherId));
    },

    async POST(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const body = await parseBody<{ topicId: number; classIds: number[]; deadline?: string }>(req);
        const publishResult = await publishTopicTasks({
            teacherId: currentTeacherId,
            topicId: body.topicId,
            classIds: body.classIds ?? [],
            deadline: body.deadline,
        });
        if (!publishResult.ok) {
            return error(publishResult.message, publishResult.code, publishResult.status);
        }

        return json({ success: true, skipped: publishResult.skipped }, 201);
    }
};

const taskItemRoutes: RouteDefinition = {
    async DELETE(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const taskId = parsePositiveRouteId(req);
        if (!taskId) return error("Invalid ID", "INVALID_ID");

        const result = await deleteTeacherTask({ teacherId: currentTeacherId, taskId });
        if (!result.ok) {
            return error(result.message, result.code, result.status);
        }

        return json({ success: true });
    },
};

const taskExtendRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const taskId = parsePositiveRouteId(req);
        if (!taskId) return error("Invalid ID", "INVALID_ID");

        const body = await parseBody<{ deadline: string }>(req);
        const extendResult = await extendTopicTaskDeadline({
            teacherId: currentTeacherId,
            taskId,
            deadline: body.deadline,
        });
        if (!extendResult.ok) {
            return error(extendResult.message, extendResult.code, extendResult.status);
        }

        return json({ success: true });
    }
};

const taskProgressRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const taskId = parsePositiveRouteId(req);
        if (!taskId) return error("Invalid ID", "INVALID_ID");

        const progress = await getTeacherTaskProgress(taskId, currentTeacherId);
        if (!progress) return error("任务不存在", "NOT_FOUND", 404);
        return json(progress);
    }
};

export {
    taskExtendRoutes,
    taskItemRoutes,
    taskProgressRoutes,
    taskRoutes,
    topicAttachmentDeleteRoutes,
    topicAttachmentDownloadRoutes,
    topicAttachmentRoutes,
    topicCopyRoutes,
    topicDetailRoutes,
    topicExcelUploadRoutes,
    topicFieldMappingRoutes,
    topicItemRoutes,
    topicRecommendQuestionRoutes,
    topicSamplingPolicyRoutes,
    topicRoutes,
    topicWeightRoutes,
};
