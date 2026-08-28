import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { topic, topicAttachment } from "../../db/schema";
import { spreadsheetRequestExceedsLimit } from "../../lib/spreadsheet";
import { buildAttachmentDownloadResponse } from "../../server/attachment-download";
import { error, getRouteParam, json, parseBody } from "../../server/http";
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
    softDeleteTeacherTopic,
    updateTeacherTopicBasics,
    updateTopicFieldMapping,
    updateTopicWeightConfig,
} from "../topic/manage-service";
import {
    getTeacherTaskProgress,
    getTeacherTopicDetail,
    listTeacherTasks,
    listTeacherTopics,
} from "../topic/query-service";
import { extendTopicTaskDeadline, publishTopicTasks, softDeleteTeacherTask } from "../topic/task-service";
import { getPrimaryTeacherIdOrThrow } from "./auth";
import { hasTopicOwnership } from "./topic-guards";

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
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const ownsTopic = await hasTopicOwnership(id, currentTeacherId, requireTopicOwner);
        if (!ownsTopic) return error("课题不存在", "NOT_FOUND", 404);

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
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const ownsTopic = await hasTopicOwnership(id, currentTeacherId, requireTopicOwner);
        if (!ownsTopic) return error("课题不存在", "NOT_FOUND", 404);

        const deleteResult = await softDeleteTeacherTopic({ teacherId: currentTeacherId, topicId: id });
        if (!deleteResult.ok) return error(deleteResult.message, deleteResult.code, deleteResult.status);
        return json({ success: true });
    }
};

const topicDetailRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = Number(getRouteParam(req, "id"));

        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        return json(await getTeacherTopicDetail(id));
    }
};

const topicExcelUploadRoutes: RouteDefinition = {
    async POST(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1 || topicRow.hasTasks) {
            return error("已发布或已分配任务的课题不能修改总体数据", "FORBIDDEN", 403);
        }
        if (spreadsheetRequestExceedsLimit(req)) {
            return error("表格文件不能超过20 MiB", "FILE_TOO_LARGE", 413);
        }

        const formData = await req.formData();
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
        });
    }
};

const topicFieldMappingRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1 || topicRow.hasTasks) {
            return error("已发布或已分配任务的课题不能修改字段映射", "FORBIDDEN", 403);
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

const topicAttachmentRoutes: RouteDefinition = {
    async POST(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const formData = await req.formData();
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
        const topicId = Number(getRouteParam(req, "id"));
        const attachmentId = Number(getRouteParam(req, "attachmentId"));
        if (!Number.isInteger(topicId) || topicId <= 0 || !Number.isInteger(attachmentId) || attachmentId <= 0) {
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
                isNull(topic.deletedAt),
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
        const topicId = Number(getRouteParam(req, "id"));
        const attachmentId = Number(getRouteParam(req, "attachmentId"));
        if (isNaN(topicId) || isNaN(attachmentId)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(topicId, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const deleteResult = await deleteTopicAttachment({ teacherId: currentTeacherId, topicId, attachmentId });
        if (!deleteResult.ok) return error(deleteResult.message, deleteResult.code, deleteResult.status);
        return json({ success: true });
    }
};

const topicRecommendQuestionRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        const body = await parseBody<{ items?: unknown }>(req);
        const replaceResult = await replaceTopicRecommendQuestions({ teacherId: currentTeacherId, topicId: id, items: body.items });
        if (!replaceResult.ok) return error(replaceResult.message, replaceResult.code, replaceResult.status);

        return json({ success: true });
    }
};

const topicWeightRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);
        if (topicRow.status === 1 || topicRow.hasTasks) {
            return error("已发布或已分配任务的课题不能修改评分权重", "FORBIDDEN", 403);
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
        const id = Number(getRouteParam(req, "id"));
        if (isNaN(id)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(id, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);
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
        const taskId = Number(getRouteParam(req, "id"));
        if (isNaN(taskId)) return error("Invalid ID", "INVALID_ID");

        const result = await softDeleteTeacherTask({ teacherId: currentTeacherId, taskId });
        if (!result.ok) {
            return error(result.message, result.code, result.status);
        }

        return json({ success: true });
    },
};

const taskExtendRoutes: RouteDefinition = {
    async PUT(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const taskId = Number(getRouteParam(req, "id"));
        if (isNaN(taskId)) return error("Invalid ID", "INVALID_ID");

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
        const taskId = Number(getRouteParam(req, "id"));
        if (isNaN(taskId)) return error("Invalid ID", "INVALID_ID");

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
    topicRoutes,
    topicWeightRoutes,
};
