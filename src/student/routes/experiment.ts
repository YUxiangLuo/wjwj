import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment } from "../../db/schema";
import { validateObservedVersion } from "../../lib/observed-version";
import { error, getRouteParam, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { buildAnalysisMetrics } from "../experiment/analysis-metrics";
import {
    buildPopulationCategoricalStats,
    buildPopulationNumericStats,
    buildStratifiedNumericStats,
    buildStratifiedStats,
    getCategoricalFieldsFromTopicMapping,
    getPpsEligibleNumericFields,
    parseTopicFieldMapping,
    readPopulationData,
} from "../experiment/population-data";
import { normalizeSamplePlanData } from "../experiment/sample-plan-display";
import { executeSamplingAction } from "../experiment/sampling-service";
import { parseStoredJson } from "../experiment/serialization";
import { ExperimentStatus } from "../experiment/status";
import { submitStudentExperiment } from "../experiment/submit-service";
import { getTargetSampleSizeFromSamplePlan } from "../experiment/submit-validation";
import { getStudentTaskAccessError } from "../experiment/task-access";
import {
    findStudentTaskPopulationSize,
    findStudentTaskSamplingInfo,
    findStudentTaskSchedule,
    findStudentTaskSubmitInfo,
    findStudentTaskTopicInfo,
} from "../experiment/task-info";
import { ensureTaskIsOpen, ensureTaskSubmissionWindow, hasTaskDeadlinePassed } from "../experiment/task-timing";
import { buildStageCompletionUpdates, buildStageReopenUpdates } from "../experiment/update-service";
import { getOrCreateStudentExperiment } from "../experiment/workflow";
import { requireAuth } from "./auth";

function getTaskId(req: Request) {
    const id = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function getStage(req: Request) {
    const stage = Number.parseInt(getRouteParam(req, "stage") ?? "", 10);
    return Number.isInteger(stage) && stage >= 1 && stage <= 4 ? stage : null;
}

function iso(value: Date | null) {
    return value?.toISOString() ?? null;
}

function buildExperimentResponse(record: typeof experiment.$inferSelect, populationSize: number | null) {
    return {
        id: record.id,
        taskId: record.taskId,
        version: record.version,
        currentStage: record.currentStage,
        status: record.status,
        questionnaire: parseStoredJson(record.questionnaire),
        samplePlan: normalizeSamplePlanData(parseStoredJson(record.samplePlan), populationSize),
        samplingResults: parseStoredJson(record.samplingResults),
        reportContent: record.reportContent,
        stage1CompletedAt: iso(record.stage1CompletedAt),
        stage2CompletedAt: iso(record.stage2CompletedAt),
        stage3CompletedAt: iso(record.stage3CompletedAt),
        stage4CompletedAt: iso(record.stage4CompletedAt),
        populationSize: populationSize ?? 10_000,
    };
}

async function loadOwnedExperiment(studentId: number, taskId: number) {
    const [record] = await db
        .select()
        .from(experiment)
        .where(and(eq(experiment.studentId, studentId), eq(experiment.taskId, taskId)));
    return record ?? null;
}

function matchesObservedExperiment(record: typeof experiment.$inferSelect, observedVersion: number) {
    return and(
        eq(experiment.id, record.id),
        eq(experiment.version, observedVersion),
        eq(experiment.status, record.status),
        eq(experiment.currentStage, record.currentStage),
    );
}

const experimentRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;

        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const openError = ensureTaskIsOpen(schedule?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);

        let record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record && hasTaskDeadlinePassed(schedule?.deadline)) return error("任务已截止", "TASK_DEADLINE");
        if (!(await findStudentTaskTopicInfo(taskId, auth.student.classId))) {
            return error("任务不存在", "NOT_FOUND", 404);
        }
        record ??= await getOrCreateStudentExperiment(auth.student.id, taskId);
        if (!record) return error("创建实验记录失败", "CREATE_FAILED", 500);
        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);
        return json(buildExperimentResponse(record, populationSize));
    },
};

const stageCompleteRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        const stage = getStage(req);
        if (!taskId || !stage) return error("无效的任务或阶段", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record) return error("实验记录不存在", "NOT_FOUND", 404);
        const body = await parseBody<Record<string, unknown> & { observedVersion?: unknown }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, record.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);
        const { observedVersion: _observedVersion, ...payload } = body;

        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const openError = ensureTaskIsOpen(schedule?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);
        const result = buildStageCompletionUpdates({
            experimentRecord: record,
            stage,
            payload,
            populationSize,
            deadlinePassed: hasTaskDeadlinePassed(schedule?.deadline),
        });
        if (!result.ok) return error(result.message, result.code, result.status);

        const [updated] = await db
            .update(experiment)
            .set(result.updates)
            .where(matchesObservedExperiment(record, versionResult.value))
            .returning();
        if (!updated) return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        return json(buildExperimentResponse(updated, populationSize));
    },
};

const stageReopenRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        const stage = getStage(req);
        if (!taskId || !stage) return error("无效的任务或阶段", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record) return error("实验记录不存在", "NOT_FOUND", 404);
        const body = await parseBody<{ observedVersion?: unknown }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, record.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);
        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const result = buildStageReopenUpdates({
            experimentRecord: record,
            stage,
            deadlinePassed: hasTaskDeadlinePassed(schedule?.deadline),
        });
        if (!result.ok) return error(result.message, result.code, result.status);
        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);
        const [updated] = await db
            .update(experiment)
            .set(result.updates)
            .where(matchesObservedExperiment(record, versionResult.value))
            .returning();
        if (!updated) return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        return json(buildExperimentResponse(updated, populationSize));
    },
};

const statsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const taskInfo = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        if (!taskInfo?.excelFilePath) return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        const population = await readPopulationData(taskInfo.excelFilePath);
        const mapping = parseTopicFieldMapping(taskInfo.fieldMapping);
        const numericFields = mapping?.numeric ?? [];
        const categoricalFields = getCategoricalFieldsFromTopicMapping(taskInfo.fieldMapping);
        return json({
            stats: buildStratifiedStats(population, taskInfo.fieldMapping),
            numericFields,
            categoricalFields,
            categoricalStats: buildPopulationCategoricalStats(population, categoricalFields),
            populationNumericStats: buildPopulationNumericStats(population, numericFields),
            ppsEligibleFields: getPpsEligibleNumericFields(population, numericFields),
            stratumNumericStats: buildStratifiedNumericStats(population, taskInfo.fieldMapping),
        });
    },
};

const samplingActionRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const body = await parseBody<{ method?: "simple" | "systematic" | "pps" | "stratified"; params?: unknown }>(req);
        if (!body.method || !["simple", "systematic", "pps", "stratified"].includes(body.method)) {
            return error("无效的抽样方法", "VALIDATION_ERROR", 400);
        }
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record || record.currentStage !== 3 || record.status === ExperimentStatus.SUBMITTED || record.status === ExperimentStatus.GRADED) {
            return error("当前不能执行抽样", "INVALID_STAGE_ORDER", 409);
        }
        const taskInfo = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        if (!taskInfo?.excelFilePath) return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        const population = await readPopulationData(taskInfo.excelFilePath);
        if (!population.length) return error("总体数据为空或读取失败", "READ_FAILED");
        const result = await executeSamplingAction({
            method: body.method,
            rawParams: body.params,
            targetSampleSize: getTargetSampleSizeFromSamplePlan(parseStoredJson(record.samplePlan)),
            population,
            fieldMapping: taskInfo.fieldMapping,
        });
        return result.ok
            ? json({ success: true, result: result.result })
            : error(result.errorMessage, "VALIDATION_ERROR", 400);
    },
};

const analysisMetricsRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        const taskInfo = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        if (!record || !taskInfo?.excelFilePath) return error("实验或总体数据不存在", "NOT_FOUND", 404);
        const population = await readPopulationData(taskInfo.excelFilePath);
        return json(
            buildAnalysisMetrics({
                population,
                fieldMapping: parseTopicFieldMapping(taskInfo.fieldMapping),
                samplingResults: parseStoredJson(record.samplingResults),
            }),
        );
    },
};

const submitRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record) return error("实验记录不存在", "NOT_FOUND", 404);
        const body = await parseBody<{ observedVersion?: unknown }>(req);
        const submissionIsComplete = record.status === ExperimentStatus.SUBMITTED || record.status === ExperimentStatus.GRADED;
        const versionResult = validateObservedVersion(body.observedVersion, record.version, {
            allowOlder: submissionIsComplete,
        });
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);
        if (submissionIsComplete) return json({ success: true, experimentId: record.id });
        const taskInfo = await findStudentTaskSubmitInfo(taskId, auth.student.classId);
        const openError = ensureTaskIsOpen(taskInfo?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        const windowError = ensureTaskSubmissionWindow(taskInfo?.deadline);
        if (windowError) return error(windowError.message, windowError.code, windowError.status);
        const result = await submitStudentExperiment({
            experimentRecord: record,
            observedVersion: versionResult.value,
            taskInfo: {
                topicName: taskInfo?.topicName ?? null,
                populationSize: taskInfo?.populationSize ?? null,
                weightConfig: taskInfo?.weightConfig,
            },
            student: { studentId: auth.student.studentId, name: auth.student.name },
        });
        return result.ok ? json({ success: true, experimentId: result.experimentId }) : error(result.message, result.code, result.status);
    },
};

export {
    analysisMetricsRoutes,
    experimentRoutes,
    samplingActionRoutes,
    stageCompleteRoutes,
    stageReopenRoutes,
    statsRoutes,
    submitRoutes,
};
