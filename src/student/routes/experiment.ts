import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { jsonbNullSafeEquals } from "../../db/native-jsonb";
import { experiment, samplingAttempt } from "../../db/schema";
import { validateObservedVersion } from "../../lib/observed-version";
import { error, getPositiveRouteId, getRouteParam, json, parseBody, parsePositiveInteger } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { analysisService, AnalysisServiceError } from "../experiment/analysis-service";
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
import {
    previewSamplingMethodResult,
    previewSamplingResults,
} from "../experiment/sampling-results-preview";
import { trimSamplingAttempts } from "../experiment/sampling-attempt-retention";
import { PPS_UNAVAILABLE_REASON } from "../experiment/sampling-messages";
import { executeSamplingAction, type SamplingMethod } from "../experiment/sampling-service";
import {
    compactSamplingMethodResult,
    hydrateSamplingResults,
    inspectSamplingResultsStorage,
    INVALID_SAMPLING_STORAGE_CODE,
    INVALID_SAMPLING_STORAGE_MESSAGE,
} from "../experiment/sampling-storage";
import { parseStoredJson } from "../experiment/serialization";
import { ExperimentStatus } from "../experiment/status";
import { submitStudentExperiment } from "../experiment/submit-service";
import { getTargetSampleSizeFromSamplePlan } from "../experiment/submit-validation";
import { resolveAnalysisTarget, resolveStudyContract } from "../../lib/analysis-target";
import {
    evaluateSamplingPolicy,
    isCompletedSamplingResult,
    resolveSamplingPolicy,
    type SamplingMethod as PolicySamplingMethod,
} from "../../lib/sampling-policy";
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
    return getPositiveRouteId(req);
}

function getStage(req: Request) {
    const stage = parsePositiveInteger(getRouteParam(req, "stage"));
    return stage !== null && stage >= 1 && stage <= 4 ? stage : null;
}

function iso(value: Date | null) {
    return value?.toISOString() ?? null;
}

async function resolveExperimentSamplingResults(
    record: typeof experiment.$inferSelect,
    taskId: number,
    classId: number,
) {
    const stored = parseStoredJson(record.samplingResults);
    const inspection = inspectSamplingResultsStorage(stored);
    if (!inspection.ok) {
        return {
            ok: false as const,
            code: INVALID_SAMPLING_STORAGE_CODE,
            message: INVALID_SAMPLING_STORAGE_MESSAGE,
        };
    }
    if (!inspection.needsPopulation) return { ok: true as const, value: stored };

    const taskInfo = await findStudentTaskSamplingInfo(taskId, classId);
    if (!taskInfo?.excelFilePath) return { ok: false as const, code: "READ_FAILED", message: "总体数据为空或读取失败" };
    const population = await readPopulationData(taskInfo.excelFilePath, taskInfo.fieldMapping);
    if (!population.length) return { ok: false as const, code: "READ_FAILED", message: "总体数据为空或读取失败" };
    const hydrated = hydrateSamplingResults(stored, population);
    if (!hydrated.ok) {
        return {
            ok: false as const,
            code: INVALID_SAMPLING_STORAGE_CODE,
            message: INVALID_SAMPLING_STORAGE_MESSAGE,
        };
    }
    return hydrated;
}

async function buildExperimentResponse(
    record: typeof experiment.$inferSelect,
    populationSize: number | null,
    taskId: number,
    classId: number,
) {
    const resolvedSamplingResults = await resolveExperimentSamplingResults(record, taskId, classId);
    if (!resolvedSamplingResults.ok) return resolvedSamplingResults;
    const taskInfo = await findStudentTaskSamplingInfo(taskId, classId);
    return { ok: true as const, value: {
        id: record.id,
        taskId: record.taskId,
        version: record.version,
        currentStage: record.currentStage,
        status: record.status,
        rejectReason: record.status === ExperimentStatus.REJECTED ? record.rejectReason : null,
        questionnaire: parseStoredJson(record.questionnaire),
        samplePlan: normalizeSamplePlanData(parseStoredJson(record.samplePlan), populationSize),
        samplingResults: previewSamplingResults(resolvedSamplingResults.value),
        reportContent: record.reportContent,
        stage1CompletedAt: iso(record.stage1CompletedAt),
        stage2CompletedAt: iso(record.stage2CompletedAt),
        stage3CompletedAt: iso(record.stage3CompletedAt),
        stage4CompletedAt: iso(record.stage4CompletedAt),
        populationSize: populationSize ?? 10_000,
        analysisTarget: resolveAnalysisTarget(taskInfo?.fieldMapping),
        studyContract: resolveStudyContract(taskInfo?.fieldMapping, { topicName: taskInfo?.topicName }),
        samplingPolicy: resolveSamplingPolicy(taskInfo?.samplingPolicy),
    } };
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

type StoredSamplingResults = Record<string, Record<string, unknown> | undefined>;

function isServerGeneratedResult(value: Record<string, unknown> | undefined) {
    return value?.serverGenerated === true;
}

interface SamplingAttemptWrite {
    seed: number;
    sampleCount: number;
    details: Record<string, unknown>;
}

async function persistSamplingMethodResult(
    record: typeof experiment.$inferSelect,
    method: SamplingMethod,
    result: Record<string, unknown>,
    attempt?: SamplingAttemptWrite,
) {
    const observedResults = parseStoredJson<StoredSamplingResults>(record.samplingResults) ?? {};
    const observedMethodResult = observedResults[method] ?? null;
    return db.transaction(async (tx) => {
        const [persisted] = await tx
            .update(experiment)
            .set({
                samplingResults: sql`jsonb_set(
                    coalesce(${experiment.samplingResults}, '{}'::jsonb),
                    array[${method}]::text[],
                    ${result}::jsonb,
                    true
                )`,
                updatedAt: new Date(),
            })
            .where(and(
                matchesObservedExperiment(record, record.version),
                jsonbNullSafeEquals(
                    sql`${experiment.samplingResults} -> ${method}`,
                    observedMethodResult,
                ),
            ))
            .returning();
        if (!persisted) return null;

        if (attempt) {
            await tx.insert(samplingAttempt).values({
                experimentId: record.id,
                method,
                seed: attempt.seed,
                sampleCount: attempt.sampleCount,
                details: attempt.details,
            });
            await trimSamplingAttempts(tx, record.id);
        }
        return persisted;
    });
}

function buildSamplingAttemptWrite(result: Record<string, unknown>): SamplingAttemptWrite {
    const {
        data: _data,
        indices: _indices,
        inclusionProbabilities: _inclusionProbabilities,
        serverGenerated: _serverGenerated,
        seed: _seed,
        sampleCount: _sampleCount,
        ...details
    } = result;
    return {
        seed: Number(result.seed),
        sampleCount: Number(result.sampleCount ?? 0),
        details,
    };
}

async function prepareStoredSamplingResultsForCompletion(params: {
    record: typeof experiment.$inferSelect;
    taskInfo: Awaited<ReturnType<typeof findStudentTaskSamplingInfo>>;
}) {
    let authoritativeRecord = params.record;
    let stored = parseStoredJson<StoredSamplingResults>(authoritativeRecord.samplingResults) ?? {};
    const policy = resolveSamplingPolicy(params.taskInfo?.samplingPolicy);

    if (policy.methods.pps !== "disabled" && !isServerGeneratedResult(stored.pps)) {
        if (!params.taskInfo?.excelFilePath) {
            return { ok: false as const, response: error("未找到总体的Excel数据文件", "NO_DATA_FILE", 500) };
        }
        const population = await readPopulationData(params.taskInfo.excelFilePath, params.taskInfo.fieldMapping);
        if (!population.length) {
            return { ok: false as const, response: error("总体数据为空或读取失败", "READ_FAILED", 500) };
        }
        const numericFields = parseTopicFieldMapping(params.taskInfo.fieldMapping)?.numeric ?? [];
        const resolvedTarget = resolveAnalysisTarget(params.taskInfo.fieldMapping);
        const targetField = resolvedTarget?.inferred ? undefined : resolvedTarget?.target.field;
        const eligibleFields = getPpsEligibleNumericFields(population, numericFields)
            .filter((field) => field !== targetField);
        if (eligibleFields.length === 0) {
            const unavailableResult = {
                unavailable: true,
                unavailableReason: PPS_UNAVAILABLE_REASON,
                serverGenerated: true,
            };
            const persisted = await persistSamplingMethodResult(authoritativeRecord, "pps", unavailableResult);
            if (!persisted) {
                return {
                    ok: false as const,
                    response: error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409),
                };
            }
            authoritativeRecord = persisted;
            stored = parseStoredJson<StoredSamplingResults>(authoritativeRecord.samplingResults) ?? {};
        }
    }

    const enabledMethods = (Object.keys(policy.methods) as PolicySamplingMethod[])
        .filter((method) => policy.methods[method] !== "disabled");
    const untrustedCompleted = enabledMethods.some((method) => (
        isCompletedSamplingResult(stored[method]) && !isServerGeneratedResult(stored[method])
    ));
    const completedMethods = enabledMethods.filter((method) => (
        isCompletedSamplingResult(stored[method]) && isServerGeneratedResult(stored[method])
    ));
    const progress = evaluateSamplingPolicy(policy, completedMethods);
    if (untrustedCompleted || !progress.canComplete) {
        return {
            ok: false as const,
            response: error("请先在当前页面完成实验模板要求的抽样方法", "SAMPLING_RESULTS_REQUIRED", 409),
        };
    }

    return { ok: true as const, record: authoritativeRecord };
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
        const response = await buildExperimentResponse(record, populationSize, taskId, auth.student.classId);
        if (!response.ok) return error(response.message, response.code, 500);
        return json(response.value);
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
        const { observedVersion: _observedVersion, ...clientPayload } = body;

        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const openError = ensureTaskIsOpen(schedule?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);
        const stageTaskInfo = stage === 2 || stage === 3
            ? await findStudentTaskSamplingInfo(taskId, auth.student.classId)
            : undefined;
        const fieldMapping = stage === 2 ? stageTaskInfo?.fieldMapping : undefined;
        let payload = clientPayload;
        let completionRecord = record;
        if (stage === 3) {
            const prepared = await prepareStoredSamplingResultsForCompletion({
                record,
                taskInfo: stageTaskInfo ?? null,
            });
            if (!prepared.ok) return prepared.response;
            completionRecord = prepared.record;
            payload = {};
        }
        const result = buildStageCompletionUpdates({
            experimentRecord: completionRecord,
            stage,
            payload,
            populationSize,
            deadlinePassed: hasTaskDeadlinePassed(schedule?.deadline),
            fieldMapping,
            samplingPolicy: stageTaskInfo?.samplingPolicy,
        });
        if (!result.ok) return error(result.message, result.code, result.status);

        const [updated] = await db
            .update(experiment)
            .set(result.updates)
            .where(matchesObservedExperiment(completionRecord, versionResult.value))
            .returning();
        if (!updated) return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        const response = await buildExperimentResponse(updated, populationSize, taskId, auth.student.classId);
        if (!response.ok) return error(response.message, response.code, 500);
        return json(response.value);
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
        const response = await buildExperimentResponse(updated, populationSize, taskId, auth.student.classId);
        if (!response.ok) return error(response.message, response.code, 500);
        return json(response.value);
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
        const population = await readPopulationData(taskInfo.excelFilePath, taskInfo.fieldMapping);
        if (!population.length) return error("总体数据为空或读取失败", "READ_FAILED", 500);
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
        const samplingPolicy = resolveSamplingPolicy(taskInfo.samplingPolicy);
        if (samplingPolicy.methods[body.method] === "disabled") {
            return error("该抽样方法未在本实验模板中启用", "SAMPLING_METHOD_DISABLED", 409);
        }
        const population = await readPopulationData(taskInfo.excelFilePath, taskInfo.fieldMapping);
        if (!population.length) return error("总体数据为空或读取失败", "READ_FAILED", 500);
        const result = await executeSamplingAction({
            method: body.method,
            rawParams: body.params,
            targetSampleSize: getTargetSampleSizeFromSamplePlan(parseStoredJson(record.samplePlan)),
            population,
            fieldMapping: taskInfo.fieldMapping,
        });
        if (!result.ok) return error(result.errorMessage, "VALIDATION_ERROR", 400);

        const authoritativeResult = compactSamplingMethodResult({
            ...result.result,
            serverGenerated: true,
        });
        const persisted = await persistSamplingMethodResult(
            record,
            body.method,
            authoritativeResult,
            buildSamplingAttemptWrite(authoritativeResult),
        );
        if (!persisted) return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);

        return json({ success: true, result: previewSamplingMethodResult(result.result) });
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
        try {
            return json(await analysisService.run({
                populationPath: taskInfo.excelFilePath,
                fieldMapping: taskInfo.fieldMapping,
                samplingResults: record.samplingResults,
                samplePlan: record.samplePlan,
                topicName: taskInfo.topicName,
            }));
        } catch (cause) {
            if (cause instanceof AnalysisServiceError) return error(cause.message, cause.code, cause.status);
            throw cause;
        }
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
                fieldMapping: taskInfo?.fieldMapping,
                samplingPolicy: taskInfo?.samplingPolicy,
                excelFilePath: taskInfo?.excelFilePath,
                className: taskInfo?.className,
                teacherName: taskInfo?.teacherName,
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
