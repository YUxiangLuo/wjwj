import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { experiment, topic } from "../../db/schema";
import { error, getRouteParam, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { buildStratifiedStats, readPopulationData } from "../experiment/population-data";
import { executeSamplingAction } from "../experiment/sampling-service";
import { getTargetSampleSizeFromSamplePlan } from "../experiment/submit-validation";
import { submitStudentExperiment } from "../experiment/submit-service";
import {
    findStudentTaskPopulationSize,
    findStudentTaskSamplingInfo,
    findStudentTaskSchedule,
    findStudentTaskSubmitInfo,
    findStudentTaskTopicInfo,
} from "../experiment/task-info";
import { getStudentTaskAccessError } from "../experiment/task-access";
import { ensureTaskIsOpen, ensureTaskSubmissionWindow, hasTaskDeadlinePassed } from "../experiment/task-timing";
import {
    buildExperimentResetUpdates,
    buildExperimentSaveUpdates,
    normalizeExperimentResetRequest,
} from "../experiment/update-service";
import { getOrCreateStudentExperiment } from "../experiment/workflow";
import { getConfigNumber } from "../../server/system-config";
import { requireAuth } from "./auth";

function getTaskId(req: Request): number {
    return Number.parseInt(getRouteParam(req, "id") ?? "", 10);
}

function getAffectedRows(result: unknown) {
    if (!result || typeof result !== "object") return 0;
    const value = (result as { affectedRows?: unknown }).affectedRows;
    return typeof value === "number" ? value : 0;
}

const experimentRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const taskAccessError = await getStudentTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const taskInfo = await findStudentTaskTopicInfo(taskId, currentStudent.classId);

        if (!taskInfo) {
            return error("任务不存在", "NOT_FOUND", 404);
        }

        const exp = await getOrCreateStudentExperiment(currentStudent.id, taskId);

        if (!exp) {
            return error("创建实验记录失败", "CREATE_FAILED", 500);
        }

        const [topicInfo] = await db.select({ excelRowCount: topic.excelRowCount }).from(topic).where(eq(topic.id, taskInfo.topicId));

        return json({
            id: exp.id,
            taskId: exp.taskId,
            currentStage: exp.currentStage,
            status: exp.status,
            questionnaire: exp.questionnaire,
            samplePlan: exp.samplePlan,
            samplingResults: exp.samplingResults,
            reportContent: exp.reportContent,
            lastSavedAt: exp.lastSavedAt?.toISOString() ?? null,
            populationSize: topicInfo?.excelRowCount ?? 10000,
        });
    },

    async PUT(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const taskAccessError = await getStudentTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const body = await parseBody<{
            currentStage?: number;
            questionnaire?: unknown;
            samplePlan?: unknown;
            samplingResults?: unknown;
            reportContent?: string;
        }>(req);

        const [exp] = await db
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        const taskInfo = await findStudentTaskSchedule(taskId, currentStudent.classId);

        const openError = ensureTaskIsOpen(taskInfo?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);

        const deadlinePassed = hasTaskDeadlinePassed(taskInfo?.deadline);

        let populationSize: number | null | undefined;
        if (body.samplePlan !== undefined) {
            populationSize = await findStudentTaskPopulationSize(taskId, currentStudent.classId);
        }

        const saveResult = buildExperimentSaveUpdates({
            experimentRecord: exp,
            body,
            populationSize,
            deadlinePassed,
        });
        if (!saveResult.ok) {
            return error(saveResult.message, saveResult.code, saveResult.status);
        }

        const [updateResult] = await db
            .update(experiment)
            .set(saveResult.updates)
            .where(and(eq(experiment.id, exp.id), eq(experiment.version, exp.version)));

        if (getAffectedRows(updateResult) === 0) {
            return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        }

        return json({ success: true, lastSavedAt: saveResult.lastSavedAt.toISOString() });
    },
};

const statsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const taskAccessError = await getStudentTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const taskInfo = await findStudentTaskSamplingInfo(taskId, currentStudent.classId);

        if (!taskInfo || !taskInfo.excelFilePath) {
            return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        }

        const population = await readPopulationData(taskInfo.excelFilePath);
        const stats = buildStratifiedStats(population, taskInfo.fieldMapping);
        if (Object.keys(stats).length === 0) {
            return json({ stats: {} });
        }

        return json({ stats });
    },
};

const samplingActionRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const taskAccessError = await getStudentTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const body = await parseBody<{
            method: "simple" | "systematic" | "stratified";
            params: any;
        }>(req);
        if (!["simple", "systematic", "stratified"].includes(body.method)) {
            return error("无效的抽样方法", "VALIDATION_ERROR", 400);
        }
        const [exp] = await db
            .select({ samplePlan: experiment.samplePlan })
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));
        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        const targetSampleSize = getTargetSampleSizeFromSamplePlan(exp.samplePlan);

        const taskInfo = await findStudentTaskSamplingInfo(taskId, currentStudent.classId);

        if (!taskInfo || !taskInfo.excelFilePath) {
            return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        }

        const population = await readPopulationData(taskInfo.excelFilePath);
        if (population.length === 0) {
            return error("总体数据为空或读取失败", "READ_FAILED");
        }

        const samplingResult = await executeSamplingAction({
            method: body.method,
            rawParams: body.params,
            targetSampleSize,
            population,
            fieldMapping: taskInfo.fieldMapping,
        });
        if (!samplingResult.ok) {
            return error(samplingResult.errorMessage, "VALIDATION_ERROR", 400);
        }

        return json({ success: true, result: samplingResult.result });
    },
};

const submitRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const taskAccessError = await getStudentTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const [exp] = await db
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        const taskInfo = await findStudentTaskSubmitInfo(taskId, currentStudent.classId);

        const openError = ensureTaskIsOpen(taskInfo?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);

        const submissionWindowError = ensureTaskSubmissionWindow(taskInfo?.deadline);
        if (submissionWindowError) {
            return error(submissionWindowError.message, submissionWindowError.code, submissionWindowError.status);
        }

        const submitResult = await submitStudentExperiment({
            experimentRecord: exp,
            taskId,
            taskInfo: {
                topicName: taskInfo?.topicName ?? null,
                populationSize: taskInfo?.populationSize ?? null,
                teacherId: taskInfo?.teacherId ?? null,
                classId: taskInfo?.classId ?? null,
            },
            student: {
                id: currentStudent.id,
                studentId: currentStudent.studentId,
                name: currentStudent.name ?? "",
            },
        });
        if (!submitResult.ok) {
            return error(submitResult.message, submitResult.code, submitResult.status);
        }

        return json({ success: true });
    },
};

const resetRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = getTaskId(req);
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const taskAccessError = await getStudentTaskAccessError(taskId, currentStudent.classId);
        if (taskAccessError) return taskAccessError;

        const body = await parseBody<{ resetToStage: number; clearQuestionnaire?: boolean }>(req);
        const resetRequest = normalizeExperimentResetRequest(body);

        const [exp] = await db
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp) {
            return error("实验记录不存在", "NOT_FOUND", 404);
        }

        const taskInfo = await findStudentTaskSchedule(taskId, currentStudent.classId);

        const openError = ensureTaskIsOpen(taskInfo?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);

        const deadlinePassed = hasTaskDeadlinePassed(taskInfo?.deadline);

        const resetResult = buildExperimentResetUpdates({
            experimentRecord: exp,
            resetToStage: resetRequest.resetToStage,
            clearQuestionnaire: resetRequest.clearQuestionnaire,
            deadlinePassed,
        });
        if (!resetResult.ok) {
            return error(resetResult.message, resetResult.code, resetResult.status);
        }

        const [updateResult] = await db
            .update(experiment)
            .set(resetResult.updates)
            .where(and(eq(experiment.id, exp.id), eq(experiment.version, exp.version)));

        if (getAffectedRows(updateResult) === 0) {
            return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        }

        return json({ success: true, lastSavedAt: resetResult.lastSavedAt.toISOString() });
    },
};

export { experimentRoutes, resetRoutes, samplingActionRoutes, statsRoutes, submitRoutes };
