import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment, task, topic, topicAttachment } from "../../db/schema";
import { error, getRouteParam, getSearchParams } from "../../server/http";
import { buildAttachmentDownloadResponse } from "../../server/attachment-download";
import type { RouteDefinition } from "../../server/route-types";
import { resolveStoragePath } from "../../server/storage-files";
import { getStudentTaskAccessError, getStudentTopicAttachmentAccessError } from "../experiment/task-access";
import { readPopulationData } from "../experiment/population-data";
import {
    hydrateSamplingResults,
    inspectSamplingResultsStorage,
    INVALID_SAMPLING_STORAGE_CODE,
    INVALID_SAMPLING_STORAGE_MESSAGE,
} from "../experiment/sampling-storage";
import { parseStoredJson } from "../experiment/serialization";
import {
    buildSamplingResultsCsvExport,
    parseSamplingExportType,
} from "../experiment/sampling-results-export";
import { requireAuth } from "./auth";

export function resolveAttachmentPath(filePath: string) {
    return resolveStoragePath(filePath);
}

const attachmentDownloadRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const attachmentId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!attachmentId) {
            return error("无效的附件ID", "INVALID_ID");
        }

        const [att] = await db
            .select({
                id: topicAttachment.id,
                topicId: topicAttachment.topicId,
                fileName: topicAttachment.fileName,
                filePath: topicAttachment.filePath,
                fileType: topicAttachment.fileType,
            })
            .from(topicAttachment)
            .where(eq(topicAttachment.id, attachmentId));

        if (!att) {
            return error("附件不存在", "NOT_FOUND", 404);
        }

        const attachmentAccessError = await getStudentTopicAttachmentAccessError(att.topicId, currentStudent.classId);
        if (attachmentAccessError) return attachmentAccessError;

        return buildAttachmentDownloadResponse({
            request: req,
            fileName: att.fileName,
            filePath: att.filePath,
        });
    },
};

const exportRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const taskAccessError = await getStudentTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const type = parseSamplingExportType(getSearchParams(req).get("type"));
        if (!type) {
            return error("无效的导出类型", "VALIDATION_ERROR", 400);
        }

        const [exp] = await db
            .select({
                samplingResults: experiment.samplingResults,
                excelFilePath: topic.excelFilePath,
            })
            .from(experiment)
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp?.samplingResults) {
            return error("暂无抽样结果", "NO_DATA", 404);
        }

        const storedResults = parseStoredJson(exp.samplingResults);
        const inspection = inspectSamplingResultsStorage(storedResults);
        if (!inspection.ok) return error(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
        let results = storedResults;
        if (inspection.needsPopulation) {
            if (!exp.excelFilePath) return error("总体数据为空或读取失败", "READ_FAILED", 500);
            const population = await readPopulationData(exp.excelFilePath);
            if (!population.length) return error("总体数据为空或读取失败", "READ_FAILED", 500);
            const hydrated = hydrateSamplingResults(storedResults, population);
            if (!hydrated.ok) return error(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
            results = hydrated.value;
        }
        if (!results) {
            return error("暂无抽样结果", "NO_DATA", 404);
        }

        const exported = buildSamplingResultsCsvExport(results, type);
        if (!exported) {
            return error("暂无可导出的数据", "NO_DATA", 404);
        }

        return new Response(exported.csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`,
            },
        });
    },
};

export { attachmentDownloadRoutes, exportRoutes };
