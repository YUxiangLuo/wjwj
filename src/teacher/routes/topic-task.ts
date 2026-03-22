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
import { extendTopicTaskDeadline, publishTopicTasks } from "../topic/task-service";
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

        await softDeleteTeacherTopic({ teacherId: currentTeacherId, topicId: id });
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
        if (topicRow.status === 1) return error("已发布课题不能修改数据", "FORBIDDEN", 403);

        const formData = await req.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) return error("请选择文件", "VALIDATION_ERROR", 400);
        const replaceResult = await replaceTopicExcelData({ topicId: id, file });
        if (!replaceResult.ok) return error(replaceResult.message, replaceResult.code, replaceResult.status);

        return json({
            filePath: replaceResult.filePath,
            rowCount: replaceResult.rowCount,
            colCount: replaceResult.colCount,
            columns: replaceResult.columns,
            preview: replaceResult.preview,
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
        if (topicRow.status === 1) return error("已发布课题不能修改字段映射", "FORBIDDEN", 403);

        const body = await parseBody<{ fieldMapping: any }>(req);
        const mappingResult = await updateTopicFieldMapping({
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
        const uploadResult = await uploadTopicAttachment({ topicId: id, file });
        if (!uploadResult.ok) return error(uploadResult.message, uploadResult.code, uploadResult.status);

        return json({ id: uploadResult.id, filePath: uploadResult.filePath });
    }
};

const topicAttachmentDeleteRoutes: RouteDefinition = {
    async DELETE(req) {
        const currentTeacherId = getPrimaryTeacherIdOrThrow(req);
        const topicId = Number(getRouteParam(req, "id"));
        const attachmentId = Number(getRouteParam(req, "attachmentId"));
        if (isNaN(topicId) || isNaN(attachmentId)) return error("Invalid ID", "INVALID_ID");

        const topicRow = await requireTopicOwner(topicId, currentTeacherId);
        if (!topicRow) return error("课题不存在", "NOT_FOUND", 404);

        await deleteTopicAttachment({ topicId, attachmentId });
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
        const replaceResult = await replaceTopicRecommendQuestions({ topicId: id, items: body.items });
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

        const body = await parseBody<{ weightConfig: { questionnaire: number; process: number; report: number } }>(req);
        const weightResult = await updateTopicWeightConfig({
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
