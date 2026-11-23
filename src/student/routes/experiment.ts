import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { experiment, samplingAttempt } from "../../db/schema";
import { validateObservedVersion } from "../../lib/observed-version";
import { error, getPositiveRouteId, getRouteParam, handleServerError, json, parseBody, parsePositiveInteger } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { analysisService } from "../experiment/analysis-service";
import { populationStatsService, populationRevisionKey } from "../experiment/population-stats-service";
import { readPopulationData } from "../experiment/population-data";
import { getSubmissionSourceConflict } from "../experiment/submission-source";
import { normalizeSamplePlanData } from "../experiment/sample-plan-display";
import {
    previewSamplingMethodResult,
    previewSamplingResults,
} from "../experiment/sampling-results-preview";
import { trimSamplingAttempts } from "../experiment/sampling-attempt-retention";
import { PPS_UNAVAILABLE_REASON } from "../experiment/sampling-messages";
import { executeSamplingAction, parseSamplingSeed, type SamplingMethod } from "../experiment/sampling-service";
import {
    compactSamplingMethodResult,
    hydrateSamplingResults,
    inspectSamplingResultsStorage,
    INVALID_SAMPLING_STORAGE_CODE,
    INVALID_SAMPLING_STORAGE_MESSAGE,
} from "../experiment/sampling-storage";
import { parseStoredJson } from "../experiment/serialization";
import { ExperimentStatus } from "@/domain/experiment/status";
import { submitStudentExperiment } from "../experiment/submit-service";
import {
    getTargetSampleSizeFromSamplePlan,
    validateMeanPlanVariance,
    validateQuestionnaireForSubmit,
    validateSamplePlanForSubmit,
    validateSamplingResultsForSubmit,
} from "../experiment/submit-validation";
import { resolveAnalysisTarget, resolveStudyContract } from "../../lib/analysis-target";
import {
    evaluateSamplingPolicy,
    filterPpsEligibleFields,
    isCompletedSamplingResult,
    resolveSamplingPolicy,
    SAMPLING_METHODS,
    type SamplingMethod as PolicySamplingMethod,
    applyPpsAvailability,
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
import { attachCalculatedSampleSize, finitePopulationS2ToSigma2 } from "../experiment/sample-plan";
import { getOrCreateStudentExperiment } from "../experiment/workflow";
import { requireAuth } from "./auth";
import { AnalysisConflict, listSavedAnalyses, loadAnalysisReferences, parseAnalysisReferences } from "../experiment/saved-analysis-service";
import { readVariableSource } from "../../server/variable-source";
import { resolveTargetUnit } from "../experiment/target-unit";
import { canonicalizeRichTextHtmlForStorage } from "../../server/rich-text";
import { validateQuestionBindings } from "../../domain/variables/question-binding";
import type { QuestionnaireData } from "../../lib/questionnaire-types";
import {
    DEFAULT_CLEANING_CONFIG,
    evaluateQuestionnaireBurden,
    parseAdjustmentPlan,
    resolveCleaningConfig,
    resolveFieldworkConfig,
    type StoredExperimentWave,
} from "../../domain/fieldwork";
import {
    ensureActiveWave,
    getVerifiedWave1EmpiricalVariance,
    hydrateWaveViews,
    parseStoredWaves,
    simulateWaveDispatchForCompletedMethods,
    syncExperimentWaveRow,
    syncExperimentWavesSnapshot,
} from "../experiment/fieldwork-wave-service";

function getTaskId(req: Request) {
    return getPositiveRouteId(req);
}

function getStage(req: Request) {
    const stage = parsePositiveInteger(getRouteParam(req, "stage"));
    return stage !== null && stage >= 1 && stage <= 5 ? stage : null;
}

function iso(value: Date | null | undefined) {
    return value?.toISOString() ?? null;
}

async function resolveExperimentSamplingAndPopulation(
    record: typeof experiment.$inferSelect,
    taskId: number,
    classId: number,
) {
    const stored = parseStoredJson(record.samplingResults);
    const storedWaves = parseStoredWaves(record.wavesData);
    const inspection = inspectSamplingResultsStorage(stored);
    if (!inspection.ok) {
        return {
            ok: false as const,
            code: INVALID_SAMPLING_STORAGE_CODE,
            message: INVALID_SAMPLING_STORAGE_MESSAGE,
        };
    }

    const taskInfo = await findStudentTaskSamplingInfo(taskId, classId);
    const needsPopulation = inspection.needsPopulation || storedWaves.length > 0;
    if (!needsPopulation) {
        return { ok: true as const, value: stored, population: [] as Array<Record<string, unknown>>, taskInfo };
    }

    const conflict = await getSubmissionSourceConflict(record, taskInfo?.excelFilePath ?? null);
    if (conflict) return conflict;
    if (!taskInfo?.excelFilePath) {
        if (!inspection.needsPopulation) {
            return { ok: true as const, value: stored, population: [] as Array<Record<string, unknown>>, taskInfo };
        }
        return { ok: false as const, code: "READ_FAILED", message: "总体数据为空或读取失败" };
    }
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
    return { ok: true as const, value: hydrated.value, population, taskInfo };
}

async function buildExperimentResponse(
    record: typeof experiment.$inferSelect,
    populationSize: number | null,
    taskId: number,
    classId: number,
) {
    const resolved = await resolveExperimentSamplingAndPopulation(record, taskId, classId);
    if (!resolved.ok) return resolved;
    const { taskInfo, population } = resolved;
    const storedWaves = parseStoredWaves(record.wavesData);
    const waveViews = storedWaves.length > 0
        ? hydrateWaveViews({
            waves: storedWaves,
            population,
            populationSize,
            fieldMapping: taskInfo?.fieldMapping,
            fieldworkConfig: taskInfo?.fieldworkConfig,
            dictionary: taskInfo?.variableDictionary,
        })
        : [];
    const analyses = record.analysisReferences?.length ? await listSavedAnalyses(record.studentId, classId, taskId) : null;
    return {
        ok: true as const,
        value: {
            id: record.id,
            taskId: record.taskId,
            version: record.version,
            currentStage: record.currentStage,
            activeWaveNumber: record.activeWaveNumber ?? 1,
            status: record.status,
            rejectReason: record.status === ExperimentStatus.REJECTED ? record.rejectReason : null,
            questionnaire: parseStoredJson(record.questionnaire),
            samplePlan: normalizeSamplePlanData(parseStoredJson(record.samplePlan), populationSize),
            samplingResults: previewSamplingResults(resolved.value),
            adjustmentPlan: parseAdjustmentPlan(parseStoredJson(record.adjustmentPlan)),
            waves: waveViews,
            reportContent: record.reportContent,
            samplingGeneration: record.samplingGeneration,
            analysisReferences: record.analysisReferences ?? [],
            analysisAppendices: (record.analysisReferences ?? []).flatMap(id => analyses?.records.filter(row => row.id === id) ?? []),
            stage1CompletedAt: iso(record.stage1CompletedAt),
            stage2CompletedAt: iso(record.stage2CompletedAt),
            stage3CompletedAt: iso(record.stage3CompletedAt),
            stage4CompletedAt: iso(record.stage4CompletedAt),
            stage5CompletedAt: iso(record.stage5CompletedAt),
            populationSize: populationSize ?? 10_000,
            analysisTarget: resolveAnalysisTarget(taskInfo?.fieldMapping),
            studyContract: resolveStudyContract(taskInfo?.fieldMapping, { topicName: taskInfo?.topicName }),
            samplingPolicy: resolveSamplingPolicy(taskInfo?.samplingPolicy),
            fieldworkConfig: resolveFieldworkConfig(taskInfo?.fieldworkConfig),
        },
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

type StoredSamplingResults = Record<string, Record<string, unknown> | undefined>;

function isServerGeneratedResult(value: Record<string, unknown> | undefined) {
    return value?.serverGenerated === true;
}

interface SamplingAttemptWrite {
    seed: number;
    sampleCount: number;
    details: Record<string, unknown>;
}

async function persistWaveSamplingMethodResult(
    record: typeof experiment.$inferSelect,
    method: SamplingMethod,
    result: Record<string, unknown>,
    attempt?: SamplingAttemptWrite,
) {
    const activeWaveNum = record.currentStage === 2 ? 1 : Math.max(2, record.activeWaveNumber || 2);
    const { waves, activeWave } = ensureActiveWave({ ...record, activeWaveNumber: activeWaveNum });
    const nextWaveSampling = {
        ...(activeWave.samplingResults ?? {}),
        [method]: result,
    };
    // Re-sampling a method invalidates that method's previous fieldwork in this wave
    const nextMethodsFieldwork = { ...(activeWave.fieldwork?.methods ?? {}) };
    delete nextMethodsFieldwork[method];
    const nextWave: StoredExperimentWave = {
        ...activeWave,
        samplingResults: nextWaveSampling,
        fieldwork: Object.keys(nextMethodsFieldwork).length > 0 ? { methods: nextMethodsFieldwork } : null,
    };
    const nextWaves = waves.map((w) => (w.waveNumber === activeWaveNum ? nextWave : w));

    return db.transaction(async (tx) => {
        const [persisted] = await tx
            .update(experiment)
            .set({
                activeWaveNumber: activeWaveNum,
                samplingResults: nextWaveSampling,
                wavesData: nextWaves,
                samplingGeneration: sql`${experiment.samplingGeneration} + 1`,
                updatedAt: new Date(),
            })
            .where(matchesObservedExperiment(record, record.version))
            .returning();
        if (!persisted) return null;

        await syncExperimentWaveRow(tx, record.id, nextWave);

        if (attempt) {
            await tx.insert(samplingAttempt).values({
                experimentId: record.id,
                waveNumber: activeWaveNum,
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

async function prepareStoredSamplingResultsForFormalCompletion(params: {
    record: typeof experiment.$inferSelect;
    taskInfo: Awaited<ReturnType<typeof findStudentTaskSamplingInfo>>;
    signal?: AbortSignal;
}) {
    let authoritativeRecord = params.record;
    const activeWaveNum = Math.max(2, authoritativeRecord.activeWaveNumber || 2);
    const initialStoredWaves = parseStoredWaves(authoritativeRecord.wavesData);
    let { activeWave } = ensureActiveWave({ ...authoritativeRecord, activeWaveNumber: activeWaveNum });
    let stored = (
        initialStoredWaves.length > 0
            ? (activeWave.samplingResults ?? {})
            : (activeWave.samplingResults ?? parseStoredJson<StoredSamplingResults>(authoritativeRecord.samplingResults) ?? {})
    ) as StoredSamplingResults;
    const policy = resolveSamplingPolicy(params.taskInfo?.samplingPolicy);

    if (policy.methods.pps !== "disabled" && !isServerGeneratedResult(stored.pps)) {
        if (!params.taskInfo?.excelFilePath) {
            return { ok: false as const, response: error("未找到总体的Excel数据文件", "NO_DATA_FILE", 500) };
        }
        let ppsEligibleFields: string[];
        try {
            const stats = await populationStatsService.run({
                populationPath: params.taskInfo.excelFilePath,
                fieldMapping: params.taskInfo.fieldMapping,
                ppsSizeFields: policy.ppsSizeFields,
            }, params.signal);
            ppsEligibleFields = stats.ppsEligibleFields;
        } catch (cause) {
            return { ok: false as const, response: handleServerError(cause) };
        }
        const resolvedTarget = resolveAnalysisTarget(params.taskInfo.fieldMapping);
        const targetField = resolvedTarget?.inferred ? undefined : resolvedTarget?.target.field;
        const eligibleFields = ppsEligibleFields.filter((field) => field !== targetField);
        if (eligibleFields.length === 0) {
            const unavailableResult = {
                unavailable: true,
                unavailableReason: PPS_UNAVAILABLE_REASON,
                serverGenerated: true,
            };
            const persisted = await persistWaveSamplingMethodResult(authoritativeRecord, "pps", unavailableResult);
            if (!persisted) {
                return {
                    ok: false as const,
                    response: error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409),
                };
            }
            authoritativeRecord = persisted;
            ({ activeWave } = ensureActiveWave({ ...authoritativeRecord, activeWaveNumber: activeWaveNum }));
            stored = (activeWave.samplingResults ?? {}) as StoredSamplingResults;
        }
    }

    const effectivePolicy = applyPpsAvailability(policy, stored);
    const enabledMethods = (Object.keys(effectivePolicy.methods) as PolicySamplingMethod[])
        .filter((method) => effectivePolicy.methods[method] !== "disabled");
    const untrustedCompleted = enabledMethods.some((method) => (
        isCompletedSamplingResult(stored[method]) && !isServerGeneratedResult(stored[method])
    ));
    const completedMethods = enabledMethods.filter((method) => (
        isCompletedSamplingResult(stored[method]) && isServerGeneratedResult(stored[method])
    ));
    const progress = evaluateSamplingPolicy(effectivePolicy, completedMethods);
    if (untrustedCompleted || !progress.canComplete) {
        return {
            ok: false as const,
            response: error("请先在当前正式轮次完成实验模板要求的必做及对比抽样方法", "SAMPLING_RESULTS_REQUIRED", 409),
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
        if (!response.ok) return error(response.message, response.code, response.code === "SOURCE_CONFLICT" ? 409 : 500);
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
        const deadlinePassed = hasTaskDeadlinePassed(schedule?.deadline);
        if (deadlinePassed) return error("任务已截止，无法完成阶段", "TASK_DEADLINE");

        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);
        const stageTaskInfo = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        const fieldMapping = stageTaskInfo?.fieldMapping;
        const resolvedTarget = (stage === 2 || stage === 4) ? resolveAnalysisTarget(fieldMapping) : null;
        const stratifiedRequired = stage === 4 && resolveSamplingPolicy(stageTaskInfo?.samplingPolicy).methods.stratified === "required";
        const meanVarianceRequired = (stage === 2 || stage === 4) && resolvedTarget?.target.kind === "mean";

        let stratifiedStats: Record<string, Record<string, number>> | undefined;
        let expectedPopulationVariance: number | null = null;
        let verifiedWave1Variance: number | null = null;

        if (stratifiedRequired || meanVarianceRequired) {
            const rawPlanCandidate = (clientPayload.samplePlan ?? parseStoredJson(record.samplePlan)) as Record<string, unknown> | null;
            const usesPriorEstimate = stage === 2 && rawPlanCandidate?.varianceSource === "prior_estimate";
            if (!usesPriorEstimate) {
                if (!stageTaskInfo?.excelFilePath) {
                    return error(stratifiedRequired ? "必做分层抽样缺少总体数据文件" : "均值规划需要读取总体数据文件", "NO_DATA_FILE");
                }
                try {
                    const stats = await populationStatsService.run({
                        populationPath: stageTaskInfo.excelFilePath, fieldMapping,
                    }, req.signal);
                    if (stratifiedRequired) stratifiedStats = stats.stats;
                    if (meanVarianceRequired && resolvedTarget) {
                        const stat = stats.populationNumericStats[resolvedTarget.target.field];
                        expectedPopulationVariance = stat ? finitePopulationS2ToSigma2(stat.variance, stat.count) : null;
                    }
                    if (stage === 4 && rawPlanCandidate?.varianceSource === "wave1_empirical") {
                        const popRows = await readPopulationData(stageTaskInfo.excelFilePath, fieldMapping);
                        verifiedWave1Variance = getVerifiedWave1EmpiricalVariance({
                            waves: parseStoredWaves(record.wavesData),
                            population: popRows,
                            fieldMapping,
                            fieldworkConfig: stageTaskInfo.fieldworkConfig,
                            dictionary: stageTaskInfo.variableDictionary,
                        });
                    }
                } catch (cause) { return handleServerError(cause); }
            }
        }

        let completionRecord = record;
        if (stage === 4) {
            const prepared = await prepareStoredSamplingResultsForFormalCompletion({
                record,
                taskInfo: stageTaskInfo ?? null,
                signal: req.signal,
            });
            if (!prepared.ok) return prepared.response;
            completionRecord = prepared.record;
        }

        const result = buildStageCompletionUpdates({
            experimentRecord: completionRecord,
            stage,
            payload: clientPayload,
            populationSize,
            deadlinePassed,
            fieldMapping,
            samplingPolicy: stageTaskInfo?.samplingPolicy,
            stratifiedStats,
            populationVariance: expectedPopulationVariance,
            verifiedWave1Variance,
            variableDictionary: stageTaskInfo?.variableDictionary,
        });
        if (!result.ok) return error(result.message, result.code, result.status);

        try {
            const references = stage === 5 ? parseAnalysisReferences(clientPayload.analysisReferences ?? []) : [];
            const boundInStage = (stage === 1 || stage === 4)
                && Boolean((result.updates.questionnaire as { questions?: { variableBinding?: unknown }[] } | undefined)?.questions?.some((question) => question.variableBinding));
            if (boundInStage || references.length) {
                if (!stageTaskInfo?.excelFilePath || !stageTaskInfo.variableDictionary
                    || stageTaskInfo.variableRevision !== stageTaskInfo.variableDictionary.revision
                    || (await readVariableSource(stageTaskInfo.excelFilePath, stageTaskInfo.fieldMapping)).source !== stageTaskInfo.variableDictionary.source) {
                    return error("变量字典来源已变化，请重新确认", "SOURCE_CONFLICT", 409);
                }
            }
            if (stage === 5) {
                await loadAnalysisReferences(completionRecord, stageTaskInfo?.variableDictionary ?? null, references);
                result.updates.analysisReferences = references;
            }
        } catch (cause) {
            return cause instanceof AnalysisConflict ? error(cause.message, cause.code, cause.status) : handleServerError(cause);
        }

        const finalizedSampling = result.updates.samplingResults as Record<string, Record<string, unknown> | undefined> | undefined;
        if (
            stage === 4
            && resolveSamplingPolicy(stageTaskInfo?.samplingPolicy).methods.pps === "required"
            && finalizedSampling?.pps?.unavailable !== true
        ) {
            if (!stageTaskInfo?.excelFilePath) return error("必做 PPS 缺少总体数据文件", "NO_DATA_FILE");
            try {
                const stats = await populationStatsService.run({
                    populationPath: stageTaskInfo.excelFilePath,
                    fieldMapping,
                    ppsSampleSize: Number((result.updates.samplePlan as Record<string, unknown>).finalSampleSize),
                    ppsSizeFields: resolveSamplingPolicy(stageTaskInfo.samplingPolicy).ppsSizeFields,
                }, req.signal);
                if (stats.ppsPlanFeasible === false) {
                    return error("当前样本量下，所有辅助规模变量均无法可靠计算必做 PPS 的入样概率。请调整样本量后重试；选择总体规模进行普查可避免此概率精度问题。", "PPS_PLAN_INFEASIBLE");
                }
            } catch (cause) { return handleServerError(cause); }
        }

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(experiment)
                .set(result.updates)
                .where(matchesObservedExperiment(completionRecord, versionResult.value))
                .returning();
            if (!row) return null;
            if (Array.isArray(result.updates.wavesData)) {
                await syncExperimentWavesSnapshot(tx, row.id, result.updates.wavesData as StoredExperimentWave[]);
            }
            return row;
        });
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
        const openError = ensureTaskIsOpen(schedule?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        const result = buildStageReopenUpdates({
            experimentRecord: record,
            stage,
            deadlinePassed: hasTaskDeadlinePassed(schedule?.deadline),
        });
        if (!result.ok) return error(result.message, result.code, result.status);
        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);
        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(experiment)
                .set(result.updates)
                .where(matchesObservedExperiment(record, versionResult.value))
                .returning();
            if (!row) return null;
            if (Array.isArray(result.updates.wavesData)) {
                await syncExperimentWavesSnapshot(tx, row.id, result.updates.wavesData as StoredExperimentWave[]);
            }
            return row;
        });
        if (!updated) return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        const response = await buildExperimentResponse(updated, populationSize, taskId, auth.student.classId);
        if (!response.ok) return error(response.message, response.code, 500);
        return json(response.value);
    },
};

const wavePlanRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record || (record.currentStage !== 2 && record.currentStage !== 4) || record.status === ExperimentStatus.SUBMITTED || record.status === ExperimentStatus.GRADED) {
            return error("当前阶段不能更新样本量规划", "INVALID_STAGE_ORDER", 409);
        }
        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const openError = ensureTaskIsOpen(schedule?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        if (hasTaskDeadlinePassed(schedule?.deadline)) return error("任务已截止，无法保存样本量规划", "TASK_DEADLINE");

        const body = await parseBody<{ observedVersion?: unknown; samplePlan?: unknown }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, record.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);
        if (!body.samplePlan || typeof body.samplePlan !== "object" || Array.isArray(body.samplePlan)) {
            return error("样本量规划格式无效", "VALIDATION_ERROR", 400);
        }

        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);
        const taskInfo = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        const resolvedTarget = resolveAnalysisTarget(taskInfo?.fieldMapping);
        const samplePlan = attachCalculatedSampleSize(body.samplePlan as Record<string, unknown>, populationSize);
        const planError = validateSamplePlanForSubmit(samplePlan, populationSize, resolvedTarget?.target.kind);
        if (planError) return error(planError, "VALIDATION_ERROR", 400);

        if (resolvedTarget?.target.kind === "mean") {
            const usesPrior = record.currentStage === 2 && samplePlan.varianceSource === "prior_estimate";
            if (!usesPrior && taskInfo?.excelFilePath) {
                const stats = await populationStatsService.run({
                    populationPath: taskInfo.excelFilePath,
                    fieldMapping: taskInfo.fieldMapping,
                }, req.signal);
                const stat = stats.populationNumericStats[resolvedTarget.target.field];
                const actualVar = stat ? finitePopulationS2ToSigma2(stat.variance, stat.count) : null;
                let verifiedW1: number | null = null;
                if (record.currentStage === 4 && samplePlan.varianceSource === "wave1_empirical") {
                    const popRows = await readPopulationData(taskInfo.excelFilePath, taskInfo.fieldMapping);
                    verifiedW1 = getVerifiedWave1EmpiricalVariance({
                        waves: parseStoredWaves(record.wavesData),
                        population: popRows,
                        fieldMapping: taskInfo.fieldMapping,
                        fieldworkConfig: taskInfo.fieldworkConfig,
                        dictionary: taskInfo.variableDictionary,
                    });
                }
                const varError = validateMeanPlanVariance(samplePlan, "mean", actualVar, {
                    allowPriorEstimate: record.currentStage === 2,
                    verifiedEmpiricalVariance: verifiedW1,
                });
                if (varError) return error(varError, "VALIDATION_ERROR", 400);
            }
        }

        if (record.currentStage === 4 && resolveSamplingPolicy(taskInfo?.samplingPolicy).methods.pps === "required" && taskInfo?.excelFilePath) {
            const stats = await populationStatsService.run({
                populationPath: taskInfo.excelFilePath,
                fieldMapping: taskInfo.fieldMapping,
                ppsSampleSize: Number(samplePlan.finalSampleSize),
                ppsSizeFields: resolveSamplingPolicy(taskInfo.samplingPolicy).ppsSizeFields,
            }, req.signal);
            if (stats.ppsPlanFeasible === false) {
                return error("当前样本量下，所有辅助规模变量均无法可靠计算必做 PPS 入样概率，请调整样本量", "PPS_PLAN_INFEASIBLE", 400);
            }
        }

        const activeWaveNum = record.currentStage === 2 ? 1 : Math.max(2, record.activeWaveNumber || 2);
        const { waves, activeWave } = ensureActiveWave({ ...record, activeWaveNumber: activeWaveNum });
        const prevTargetSize = getTargetSampleSizeFromSamplePlan(activeWave.samplePlan);
        const nextTargetSize = getTargetSampleSizeFromSamplePlan(samplePlan);
        const sizeChanged = prevTargetSize !== null && prevTargetSize !== nextTargetSize;
        const nextWave: StoredExperimentWave = {
            ...activeWave,
            samplePlan,
            ...(sizeChanged ? { samplingResults: null, fieldwork: null } : {}),
        };
        const nextWaves = waves.map((w) => (w.waveNumber === activeWaveNum ? nextWave : w));

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(experiment)
                .set({
                    version: record.version + 1,
                    activeWaveNumber: activeWaveNum,
                    samplePlan,
                    ...(sizeChanged ? { samplingResults: null, samplingGeneration: sql`${experiment.samplingGeneration} + 1` } : {}),
                    wavesData: nextWaves,
                    updatedAt: new Date(),
                })
                .where(matchesObservedExperiment(record, versionResult.value))
                .returning();
            if (!row) return null;
            await syncExperimentWaveRow(tx, record.id, nextWave);
            return row;
        });
        if (!updated) return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        const response = await buildExperimentResponse(updated, populationSize, taskId, auth.student.classId);
        if (!response.ok) return error(response.message, response.code, 500);
        return json(response.value);
    },
};

const waveQuestionnaireRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record || record.currentStage !== 4 || record.status === ExperimentStatus.SUBMITTED || record.status === ExperimentStatus.GRADED) {
            return error("仅可在第四阶段（调优正式投放）修订二轮问卷", "INVALID_STAGE_ORDER", 409);
        }
        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const openError = ensureTaskIsOpen(schedule?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        if (hasTaskDeadlinePassed(schedule?.deadline)) return error("任务已截止，无法保存问卷修订", "TASK_DEADLINE");

        const body = await parseBody<{ observedVersion?: unknown; questionnaire?: unknown }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, record.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);

        const rawQ = body.questionnaire;
        const questionnaire = rawQ && typeof rawQ === "object" && !Array.isArray(rawQ)
            ? {
                ...rawQ,
                welcomeText: canonicalizeRichTextHtmlForStorage((rawQ as Record<string, unknown>).welcomeText),
                endingText: canonicalizeRichTextHtmlForStorage((rawQ as Record<string, unknown>).endingText),
            }
            : rawQ;
        const qErr = validateQuestionnaireForSubmit(questionnaire);
        if (qErr) return error(qErr, "VALIDATION_ERROR", 400);

        const taskInfo = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        try {
            validateQuestionBindings(questionnaire as QuestionnaireData, taskInfo?.variableDictionary ?? null, taskId);
        } catch (cause) {
            return error(cause instanceof Error ? cause.message : "问卷变量绑定无效", "VALIDATION_ERROR", 400);
        }
        const resolvedTarget = resolveAnalysisTarget(taskInfo?.fieldMapping);
        if (taskInfo?.variableDictionary && resolvedTarget && !resolvedTarget.inferred) {
            const burden = evaluateQuestionnaireBurden(questionnaire as QuestionnaireData, taskInfo.variableDictionary, resolvedTarget.target);
            if (!burden.primaryTargetBound) {
                return error(`请保持核心研究指标「${resolvedTarget.target.field}」已绑定到问卷题目`, "VALIDATION_ERROR", 400);
            }
        }

        const activeWaveNum = Math.max(2, record.activeWaveNumber || 2);
        const { waves, activeWave } = ensureActiveWave({ ...record, activeWaveNumber: activeWaveNum });
        const nextWave: StoredExperimentWave = {
            ...activeWave,
            questionnaire: questionnaire as QuestionnaireData,
            fieldwork: null, // Re-dispatch required with revised questionnaire
        };
        const nextWaves = waves.map((w) => (w.waveNumber === activeWaveNum ? nextWave : w));
        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(experiment)
                .set({
                    version: record.version + 1,
                    questionnaire,
                    wavesData: nextWaves,
                    samplingGeneration: sql`${experiment.samplingGeneration} + 1`,
                    updatedAt: new Date(),
                })
                .where(matchesObservedExperiment(record, versionResult.value))
                .returning();
            if (!row) return null;
            await syncExperimentWaveRow(tx, record.id, nextWave);
            return row;
        });
        if (!updated) return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        const response = await buildExperimentResponse(updated, populationSize, taskId, auth.student.classId);
        if (!response.ok) return error(response.message, response.code, 500);
        return json(response.value);
    },
};

const fieldworkDispatchRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record || (record.currentStage !== 2 && record.currentStage !== 4) || record.status === ExperimentStatus.SUBMITTED || record.status === ExperimentStatus.GRADED) {
            return error("当前阶段不能执行问卷发放", "INVALID_STAGE_ORDER", 409);
        }
        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const openError = ensureTaskIsOpen(schedule?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        if (hasTaskDeadlinePassed(schedule?.deadline)) return error("任务已截止，无法发放问卷", "TASK_DEADLINE");

        const body = await parseBody<{ observedVersion?: unknown; seed?: unknown }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, record.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);
        const parsedSeed = parseSamplingSeed(body.seed);
        if (parsedSeed.errorMessage) return error(parsedSeed.errorMessage, "VALIDATION_ERROR", 400);

        const taskInfo = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        if (!taskInfo?.excelFilePath) return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        const population = await readPopulationData(taskInfo.excelFilePath, taskInfo.fieldMapping);
        if (!population.length) return error("总体数据为空或读取失败", "READ_FAILED", 500);
        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);

        let dispatchRecord = record;
        if (dispatchRecord.currentStage === 4) {
            const prepared = await prepareStoredSamplingResultsForFormalCompletion({
                record: dispatchRecord,
                taskInfo,
                signal: req.signal,
            });
            if (!prepared.ok) return prepared.response;
            dispatchRecord = prepared.record;
        }

        const activeWaveNum = dispatchRecord.currentStage === 2 ? 1 : Math.max(2, dispatchRecord.activeWaveNumber || 2);
        const storedWaves = parseStoredWaves(dispatchRecord.wavesData);
        const { waves, activeWave } = ensureActiveWave({ ...dispatchRecord, activeWaveNumber: activeWaveNum });
        const effectivePlan = storedWaves.length > 0
            ? activeWave.samplePlan
            : (activeWave.samplePlan ?? parseStoredJson(dispatchRecord.samplePlan));
        const targetSampleSize = getTargetSampleSizeFromSamplePlan(effectivePlan);
        if (targetSampleSize === null) {
            return error("请先保存当前波次的样本量规划后再执行问卷发放", "VALIDATION_ERROR", 400);
        }

        if (dispatchRecord.currentStage === 4) {
            const samplingErr = validateSamplingResultsForSubmit(
                activeWave.samplingResults,
                targetSampleSize,
                populationSize ?? population.length,
                taskInfo.samplingPolicy,
            );
            if (samplingErr) return error(samplingErr, "SAMPLING_RESULTS_REQUIRED", 409);
        } else {
            const policy = resolveSamplingPolicy(taskInfo.samplingPolicy);
            const completedMethods = SAMPLING_METHODS.filter((m) =>
                isCompletedSamplingResult((activeWave.samplingResults as Record<string, unknown> | null)?.[m]),
            );
            if (completedMethods.length === 0) {
                return error("请先执行至少一种抽样方法获取受访者名单后再发放问卷", "SAMPLING_RESULTS_REQUIRED", 409);
            }
            for (const method of completedMethods) {
                if (policy.methods[method] === "disabled") {
                    return error("当前波次包含实验模板已禁用的抽样方法", "SAMPLING_METHOD_DISABLED", 409);
                }
                const section = (activeWave.samplingResults as Record<string, Record<string, unknown> | undefined>)[method];
                if (!isServerGeneratedResult(section)) {
                    return error("请使用系统生成的有效抽样名单", "SAMPLING_RESULTS_REQUIRED", 409);
                }
            }
        }

        const simResult = simulateWaveDispatchForCompletedMethods({
            wave: activeWave,
            population,
            fieldMapping: taskInfo.fieldMapping,
            fieldworkConfig: taskInfo.fieldworkConfig,
            dictionary: taskInfo.variableDictionary,
            seed: parsedSeed.seed,
        });
        if (!simResult.ok) return error(simResult.message, "VALIDATION_ERROR", 400);

        const nextWave: StoredExperimentWave = {
            ...activeWave,
            fieldwork: simResult.fieldwork,
        };
        const nextWaves = waves.map((w) => (w.waveNumber === activeWaveNum ? nextWave : w));

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(experiment)
                .set({
                    version: dispatchRecord.version + 1,
                    activeWaveNumber: activeWaveNum,
                    wavesData: nextWaves,
                    samplingGeneration: sql`${experiment.samplingGeneration} + 1`,
                    updatedAt: new Date(),
                })
                .where(matchesObservedExperiment(dispatchRecord, versionResult.value))
                .returning();
            if (!row) return null;
            await syncExperimentWaveRow(tx, dispatchRecord.id, nextWave);
            return row;
        });
        if (!updated) return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        const response = await buildExperimentResponse(updated, populationSize, taskId, auth.student.classId);
        if (!response.ok) return error(response.message, response.code, 500);
        return json(response.value);
    },
};

const fieldworkCleaningRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record || ![2, 3, 4].includes(record.currentStage) || record.status === ExperimentStatus.SUBMITTED || record.status === ExperimentStatus.GRADED) {
            return error("当前阶段不能调整答卷质检清洗规则", "INVALID_STAGE_ORDER", 409);
        }
        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const openError = ensureTaskIsOpen(schedule?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        if (hasTaskDeadlinePassed(schedule?.deadline)) return error("任务已截止，无法调整质检规则", "TASK_DEADLINE");

        const body = await parseBody<{ observedVersion?: unknown; waveNumber?: unknown; cleaningConfig?: unknown }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, record.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);

        if (
            body.waveNumber !== undefined
            && (typeof body.waveNumber !== "number" || !Number.isSafeInteger(body.waveNumber) || body.waveNumber < 1 || body.waveNumber > 4)
        ) {
            return error("实验波次编号无效", "VALIDATION_ERROR", 400);
        }
        if (!body.cleaningConfig || typeof body.cleaningConfig !== "object" || Array.isArray(body.cleaningConfig)) {
            return error("质检清洗规则格式无效", "VALIDATION_ERROR", 400);
        }
        const allowedCleaningKeys = new Set(["removeSpeeders", "removeStraightliners", "requirePrimaryTargetValid"]);
        for (const [key, val] of Object.entries(body.cleaningConfig as Record<string, unknown>)) {
            if (!allowedCleaningKeys.has(key) || (val !== undefined && typeof val !== "boolean")) {
                return error("质检清洗规则参数无效", "VALIDATION_ERROR", 400);
            }
        }

        const expectedWaveNum = (record.currentStage === 2 || record.currentStage === 3)
            ? 1
            : Math.max(2, record.activeWaveNumber || 2);
        const targetWaveNum = body.waveNumber !== undefined ? body.waveNumber : expectedWaveNum;
        if (targetWaveNum !== expectedWaveNum) {
            return error("当前阶段仅允许调整当前活动波次的质检清洗规则", "INVALID_STAGE_ORDER", 409);
        }
        const waves = parseStoredWaves(record.wavesData);
        const existing = waves.find((w) => w.waveNumber === targetWaveNum);
        if (!existing) return error("指定的实验波次不存在", "NOT_FOUND", 404);

        const nextWave: StoredExperimentWave = {
            ...existing,
            cleaningConfig: resolveCleaningConfig(body.cleaningConfig),
        };
        const nextWaves = waves.map((w) => (w.waveNumber === targetWaveNum ? nextWave : w));
        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(experiment)
                .set({
                    version: record.version + 1,
                    wavesData: nextWaves,
                    samplingGeneration: sql`${experiment.samplingGeneration} + 1`,
                    updatedAt: new Date(),
                })
                .where(matchesObservedExperiment(record, versionResult.value))
                .returning();
            if (!row) return null;
            await syncExperimentWaveRow(tx, record.id, nextWave);
            return row;
        });
        if (!updated) return error("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        const response = await buildExperimentResponse(updated, populationSize, taskId, auth.student.classId);
        if (!response.ok) return error(response.message, response.code, 500);
        return json(response.value);
    },
};

const newWaveRoutes: RouteDefinition = {
    async POST(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getTaskId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (!record || record.currentStage !== 4 || record.status === ExperimentStatus.SUBMITTED || record.status === ExperimentStatus.GRADED) {
            return error("仅可在第四阶段追加新一轮调优波次", "INVALID_STAGE_ORDER", 409);
        }
        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        const openError = ensureTaskIsOpen(schedule?.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        if (hasTaskDeadlinePassed(schedule?.deadline)) return error("任务已截止，无法新增波次", "TASK_DEADLINE");

        const body = await parseBody<{ observedVersion?: unknown }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, record.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);

        const waves = parseStoredWaves(record.wavesData);
        const prevWave = waves.at(-1);
        const nextWaveNumber = (prevWave?.waveNumber ?? 2) + 1;
        if (waves.length >= 4 || nextWaveNumber > 4) {
            return error("单次实验最多支持 4 轮投放迭代（含首轮试投）", "WAVE_LIMIT", 400);
        }
        if (!prevWave || prevWave.waveNumber < 2) {
            return error("请先进入正式调优轮次并完成投放后再追加微调波次", "INVALID_STAGE_ORDER", 409);
        }
        const populationSize = await findStudentTaskPopulationSize(taskId, auth.student.classId);
        const taskInfo = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        const prevTargetSize = getTargetSampleSizeFromSamplePlan(prevWave.samplePlan);
        if (prevTargetSize === null) {
            return error("请先完成当前轮次的样本量规划、抽样与问卷发放，再追加新一轮微调波次", "VALIDATION_ERROR", 400);
        }
        const prevSamplingError = validateSamplingResultsForSubmit(
            prevWave.samplingResults,
            prevTargetSize,
            populationSize,
            taskInfo?.samplingPolicy,
        );
        if (prevSamplingError) {
            return error(prevSamplingError, "SAMPLING_RESULTS_REQUIRED", 409);
        }
        const prevCompletedMethods = SAMPLING_METHODS.filter((m) =>
            isCompletedSamplingResult((prevWave.samplingResults as Record<string, unknown> | null)?.[m]),
        );
        const prevAllDispatched = prevCompletedMethods.length > 0
            && prevCompletedMethods.every((m) => Boolean(prevWave.fieldwork?.methods?.[m]?.records?.length));
        if (!prevAllDispatched) {
            return error("请先完成当前轮次的问卷发放回收，再追加新一轮微调波次", "FIELDWORK_REQUIRED", 409);
        }

        const createdWave: StoredExperimentWave = {
            waveNumber: nextWaveNumber,
            kind: "refinement",
            label: `第 ${nextWaveNumber} 轮 · 进阶微调投放`,
            questionnaire: structuredClone(prevWave.questionnaire),
            samplePlan: prevWave.samplePlan ? structuredClone(prevWave.samplePlan) : null,
            samplingResults: null,
            fieldwork: null,
            cleaningConfig: prevWave.cleaningConfig ? { ...prevWave.cleaningConfig } : { ...DEFAULT_CLEANING_CONFIG },
            completedAt: null,
        };
        const finalizedPrevWave: StoredExperimentWave = {
            ...prevWave,
            completedAt: prevWave.completedAt ?? new Date().toISOString(),
        };
        const nextWaves = [
            ...waves.map((w) => (w.waveNumber === prevWave.waveNumber ? finalizedPrevWave : w)),
            createdWave,
        ];

        const updated = await db.transaction(async (tx) => {
            const [row] = await tx
                .update(experiment)
                .set({
                    version: record.version + 1,
                    activeWaveNumber: nextWaveNumber,
                    questionnaire: createdWave.questionnaire,
                    samplePlan: createdWave.samplePlan,
                    samplingResults: null,
                    wavesData: nextWaves,
                    samplingGeneration: sql`${experiment.samplingGeneration} + 1`,
                    updatedAt: new Date(),
                })
                .where(matchesObservedExperiment(record, versionResult.value))
                .returning();
            if (!row) return null;
            await syncExperimentWavesSnapshot(tx, record.id, nextWaves);
            return row;
        });
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
        try {
            return json(await populationStatsService.run({
                populationPath: taskInfo.excelFilePath,
                fieldMapping: taskInfo.fieldMapping,
                ppsSizeFields: resolveSamplingPolicy(taskInfo.samplingPolicy).ppsSizeFields,
            }, req.signal));
        } catch (cause) {
            return handleServerError(cause);
        }
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
        const body = await parseBody<{ method?: "simple" | "systematic" | "pps" | "stratified"; params?: unknown; observedVersion?: unknown }>(req);
        if (!body.method || !["simple", "systematic", "pps", "stratified"].includes(body.method)) {
            return error("无效的抽样方法", "VALIDATION_ERROR", 400);
        }
        const record = await loadOwnedExperiment(auth.student.id, taskId);
        if (
            !record
            || (record.currentStage !== 2 && record.currentStage !== 4)
            || record.status === ExperimentStatus.SUBMITTED
            || record.status === ExperimentStatus.GRADED
        ) {
            return error("当前阶段不能执行抽样", "INVALID_STAGE_ORDER", 409);
        }
        if (body.observedVersion !== undefined) {
            const versionCheck = validateObservedVersion(body.observedVersion, record.version);
            if (!versionCheck.ok) return error(versionCheck.message, versionCheck.code, versionCheck.status);
        }
        const schedule = await findStudentTaskSchedule(taskId, auth.student.classId);
        if (!schedule) return error("任务不存在", "NOT_FOUND", 404);
        const openError = ensureTaskIsOpen(schedule.openTime);
        if (openError) return error(openError.message, openError.code, openError.status);
        if (hasTaskDeadlinePassed(schedule.deadline)) return error("任务已截止，无法执行抽样", "TASK_DEADLINE");
        const taskInfo = await findStudentTaskSamplingInfo(taskId, auth.student.classId);
        if (!taskInfo?.excelFilePath) return error("未找到总体的Excel数据文件", "NO_DATA_FILE");
        const samplingPolicy = resolveSamplingPolicy(taskInfo.samplingPolicy);
        if (samplingPolicy.methods[body.method] === "disabled") {
            return error("该抽样方法未在本实验模板中启用", "SAMPLING_METHOD_DISABLED", 409);
        }
        if (body.method === "pps" && samplingPolicy.ppsSizeFields) {
            const requestedField = (body.params as { sizeField?: unknown } | null)?.sizeField;
            if (typeof requestedField !== "string"
                || !filterPpsEligibleFields(samplingPolicy, [requestedField]).length) {
                return error("请选择实验模板指定的 PPS 规模变量", "VALIDATION_ERROR", 400);
            }
        }
        const population = await readPopulationData(taskInfo.excelFilePath, taskInfo.fieldMapping);
        if (!population.length) return error("总体数据为空或读取失败", "READ_FAILED", 500);

        const activeWaveNum = record.currentStage === 2 ? 1 : Math.max(2, record.activeWaveNumber || 2);
        const storedWaves = parseStoredWaves(record.wavesData);
        const { activeWave } = ensureActiveWave({ ...record, activeWaveNumber: activeWaveNum });
        const effectivePlan = storedWaves.length > 0
            ? activeWave.samplePlan
            : (activeWave.samplePlan ?? parseStoredJson(record.samplePlan));
        const targetSampleSize = getTargetSampleSizeFromSamplePlan(effectivePlan);
        if (targetSampleSize === null) {
            return error("请先保存当前波次的样本量规划后再执行抽样", "VALIDATION_ERROR", 400);
        }

        const result = await executeSamplingAction({
            method: body.method,
            rawParams: body.params,
            targetSampleSize,
            population,
            fieldMapping: taskInfo.fieldMapping,
        });
        if (!result.ok) return error(result.errorMessage, "VALIDATION_ERROR", 400);

        const authoritativeResult = compactSamplingMethodResult({
            ...result.result,
            serverGenerated: true,
        });
        const persisted = await persistWaveSamplingMethodResult(
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
        if (!record) return error("实验或总体数据不存在", "NOT_FOUND", 404);
        const conflict = await getSubmissionSourceConflict(record, taskInfo?.excelFilePath ?? null);
        if (conflict) return error(conflict.message, conflict.code, 409);
        if (!taskInfo?.excelFilePath) return error("实验或总体数据不存在", "NOT_FOUND", 404);
        try {
            const job = {
                populationPath: taskInfo.excelFilePath,
                fieldMapping: taskInfo.fieldMapping,
                samplingResults: record.samplingResults,
                samplePlan: record.samplePlan,
                topicName: taskInfo.topicName,
                targetUnit: resolveTargetUnit(taskInfo.fieldMapping, taskInfo.variableDictionary),
            };
            const key = new Bun.CryptoHasher("sha256").update(JSON.stringify([
                record.id, record.version, populationRevisionKey(job), job,
            ])).digest("hex");
            return json(await analysisService.run(job, { key, signal: req.signal }));
        } catch (cause) {
            return handleServerError(cause);
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
                taskId,
                topicName: taskInfo?.topicName ?? null,
                populationSize: taskInfo?.populationSize ?? null,
                weightConfig: taskInfo?.weightConfig,
                fieldMapping: taskInfo?.fieldMapping,
                samplingPolicy: taskInfo?.samplingPolicy,
                fieldworkConfig: taskInfo?.fieldworkConfig,
                excelFilePath: taskInfo?.excelFilePath,
                variableDictionary: taskInfo?.variableDictionary,
                variableRevision: taskInfo?.variableRevision,
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
    fieldworkCleaningRoutes,
    fieldworkDispatchRoutes,
    newWaveRoutes,
    samplingActionRoutes,
    stageCompleteRoutes,
    stageReopenRoutes,
    statsRoutes,
    submitRoutes,
    wavePlanRoutes,
    waveQuestionnaireRoutes,
};
