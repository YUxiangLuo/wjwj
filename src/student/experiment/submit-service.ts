import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment } from "../../db/schema";
import { validateObservedVersion } from "../../lib/observed-version";
import { resolveAnalysisTarget, resolveStudyContract, type ResolvedStudyContract } from "../../lib/analysis-target";
import { scoringWeightsFrom, type ScoringWeights } from "../../lib/scoring-weights";
import { isCompletedSamplingResult, resolveSamplingPolicy, SAMPLING_METHODS, type SamplingPolicyV1 } from "../../lib/sampling-policy";
import { readVariableSource } from "../../server/variable-source";
import { finitePopulationS2ToSigma2 } from "./sample-plan";
import { buildPopulationNumericStats, parseTopicFieldMapping } from "../../domain/statistics/population";
import { buildAnalysisMetrics } from "../../domain/statistics/analysis";
import { validateQuestionBindings } from "../../domain/variables/question-binding";
import type { TargetAnalysisMetrics } from "../../domain/experiment/analysis-types";
import type { ExperimentWaveView } from "../../domain/experiment/types";
import type { SavedAnalysisView, VariableDictionary } from "../../domain/variables/types";
import {
    parseAdjustmentPlan,
    resolveFieldworkConfig,
    validateAdjustmentPlan,
    type AdjustmentPlan,
    type FieldworkSimulationConfig,
} from "../../domain/fieldwork";
import {
    getVerifiedWave1EmpiricalVariances,
    hydrateWaveViews,
    parseStoredWaves,
    verifyExperimentWavesReplay,
} from "./fieldwork-wave-service";
import { normalizeSamplePlanData } from "./sample-plan-display";
import { analysisView, loadAnalysisReferences, parseAnalysisReferences } from "./saved-analysis-service";
import { parseStoredJson } from "./serialization";
import { compactSamplingResults, hydrateSamplingResults, INVALID_SAMPLING_STORAGE_CODE, INVALID_SAMPLING_STORAGE_MESSAGE } from "./sampling-storage";
import { verifySamplingReplay } from "./sampling-replay";
import { resolveTargetUnit } from "./target-unit";
import { ExperimentStatus } from "@/domain/experiment/status";
import {
    getTargetSampleSizeFromSamplePlan,
    validateMeanPlanVariance,
    validateQuestionnaireForSubmit,
    validateReportForSubmit,
    validateSamplePlanForSubmit,
    validateSamplingResultsForSubmit,
} from "./submit-validation";

type ExperimentRecord = typeof experiment.$inferSelect;

export interface SubmissionSnapshot {
    topicName: string;
    studentName: string;
    populationSize: number | null;
    questionnaire: Record<string, unknown> | null;
    samplePlan: Record<string, unknown> | null;
    samplingResults: Record<string, unknown> | null;
    adjustmentPlan?: AdjustmentPlan | null;
    waves?: ExperimentWaveView[];
    studyContract?: ResolvedStudyContract | null;
    fieldworkConfig?: FieldworkSimulationConfig | null;
    reportContent: string;
    weightConfig: ScoringWeights;
    samplingPolicy: SamplingPolicyV1;
    variableDictionary?: VariableDictionary | null;
    analysisAppendices?: Array<SavedAnalysisView & { evidence: unknown }>;
    targetMetrics?: TargetAnalysisMetrics | null;
    className?: string | null;
    teacherName?: string | null;
    populationFileSha256?: string | null;
    parserVersion?: string;
    samplingAlgorithmVersion?: string;
}

interface SubmitTaskInfo {
    taskId?: number;
    topicName: string | null;
    populationSize: number | string | null;
    weightConfig?: unknown;
    fieldMapping?: unknown;
    samplingPolicy?: unknown;
    fieldworkConfig?: unknown;
    excelFilePath?: string | null;
    className?: string | null;
    teacherName?: string | null;
    variableDictionary?: VariableDictionary | null;
    variableRevision?: number;
}

interface SubmitStudentInfo {
    studentId: string;
    name?: string | null;
}

function fail(message: string, code: string, status = 400) {
    return { ok: false as const, message, code, status };
}

function normalizePopulationSize(value: SubmitTaskInfo["populationSize"]) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function validateExperimentSubmission(params: {
    experimentRecord: ExperimentRecord;
    taskInfo: SubmitTaskInfo;
}) {
    const record = params.experimentRecord;
    if (record.status === ExperimentStatus.SUBMITTED) return fail("实验已提交，请勿重复提交", "ALREADY_SUBMITTED");
    if (record.status === ExperimentStatus.GRADED) return fail("实验已批改完成", "ALREADY_GRADED");
    if (record.currentStage !== 5 || !record.stage5CompletedAt) return fail("请完成全部五个实验阶段后再提交", "INCOMPLETE");

    const questionnaire = parseStoredJson(record.questionnaire);
    const samplePlan = parseStoredJson(record.samplePlan);
    const samplingResults = parseStoredJson(record.samplingResults);
    const adjustmentPlan = parseStoredJson(record.adjustmentPlan);
    const storedWaves = parseStoredWaves(record.wavesData);
    const populationSize = normalizePopulationSize(params.taskInfo.populationSize);

    const activeFormalWaveNumber = Math.max(2, record.activeWaveNumber || 2);
    const pilotWave = storedWaves.find((w) => w.waveNumber === 1);
    const formalWave = storedWaves.find((w) => w.waveNumber === activeFormalWaveNumber);
    if (storedWaves.length < 2 || !pilotWave || !formalWave) {
        return fail("请完成首轮试投诊断与至少一轮调优正式投放后再提交", "INCOMPLETE");
    }
    for (const w of storedWaves) {
        const waveQuestionnaireError = validateQuestionnaireForSubmit(w.questionnaire);
        if (waveQuestionnaireError) return fail(waveQuestionnaireError, "INCOMPLETE");
    }

    const validationError =
        validateQuestionnaireForSubmit(questionnaire) ??
        validateAdjustmentPlan(adjustmentPlan) ??
        validateSamplePlanForSubmit(
            samplePlan,
            populationSize,
            resolveAnalysisTarget(params.taskInfo.fieldMapping)?.target.kind,
        ) ??
        validateSamplingResultsForSubmit(
            samplingResults,
            getTargetSampleSizeFromSamplePlan(samplePlan),
            populationSize,
            params.taskInfo.samplingPolicy,
        ) ??
        validateReportForSubmit(record.reportContent);
    return validationError ? fail(validationError, "INCOMPLETE") : { ok: true as const };
}

export async function submitStudentExperiment(params: {
    experimentRecord: ExperimentRecord;
    observedVersion: unknown;
    taskInfo: SubmitTaskInfo;
    student: SubmitStudentInfo;
}) {
    const submissionIsComplete = params.experimentRecord.status === ExperimentStatus.SUBMITTED
        || params.experimentRecord.status === ExperimentStatus.GRADED;
    const versionResult = validateObservedVersion(
        params.observedVersion,
        params.experimentRecord.version,
        { allowOlder: submissionIsComplete },
    );
    if (!versionResult.ok) return fail(versionResult.message, versionResult.code, versionResult.status);
    if (submissionIsComplete) {
        return { ok: true as const, experimentId: params.experimentRecord.id, submittedAt: params.experimentRecord.submittedAt };
    }

    const validation = validateExperimentSubmission(params);
    if (!validation.ok) return validation;

    const populationSize = normalizePopulationSize(params.taskInfo.populationSize);
    const questionnaire = parseStoredJson<Record<string, unknown>>(params.experimentRecord.questionnaire);
    const dictionary = params.taskInfo.variableDictionary ?? null;
    const storedWaves = parseStoredWaves(params.experimentRecord.wavesData);
    const effectiveTaskId = params.taskInfo.taskId ?? params.experimentRecord.taskId;
    try {
        validateQuestionBindings(questionnaire as any, dictionary, effectiveTaskId);
        for (const w of storedWaves) {
            validateQuestionBindings(w.questionnaire as any, dictionary, effectiveTaskId);
        }
    } catch (cause) {
        return fail(cause instanceof Error ? cause.message : "问卷变量关联无效", "INVALID_BINDING", 409);
    }
    if (dictionary && dictionary.revision !== params.taskInfo.variableRevision) {
        return fail("变量字典已变化，请刷新核对", "DICTIONARY_CONFLICT", 409);
    }
    let sourceData: Awaited<ReturnType<typeof readVariableSource>> | null = null;
    if (params.taskInfo.excelFilePath) {
        try {
            sourceData = await readVariableSource(params.taskInfo.excelFilePath, params.taskInfo.fieldMapping);
        } catch {
            return fail("总体数据为空或读取失败", "READ_FAILED", 500);
        }
    }
    if (dictionary && sourceData?.source !== dictionary.source) {
        return fail("总体文件或字段解释已变化，请联系教师", "SOURCE_CONFLICT", 409);
    }

    const resolvedTarget = resolveAnalysisTarget(params.taskInfo.fieldMapping);
    if (resolvedTarget?.target.kind === "mean" && sourceData) {
        const stat = buildPopulationNumericStats(sourceData.rows, [resolvedTarget.target.field])[resolvedTarget.target.field];
        const actualVariance = stat ? finitePopulationS2ToSigma2(stat.variance, stat.count) : null;
        const verifiedWave1Variances = getVerifiedWave1EmpiricalVariances({
            waves: storedWaves,
            population: sourceData.designRows,
            fieldMapping: params.taskInfo.fieldMapping,
            fieldworkConfig: params.taskInfo.fieldworkConfig,
            dictionary,
        });
        const varianceError = validateMeanPlanVariance(
            parseStoredJson(params.experimentRecord.samplePlan),
            resolvedTarget.target.kind,
            actualVariance,
            { verifiedEmpiricalVariances: verifiedWave1Variances },
        );
        if (varianceError) return fail(varianceError, "INCOMPLETE");
    }

    let referenced;
    try {
        const ids = parseAnalysisReferences(params.experimentRecord.analysisReferences);
        referenced = await loadAnalysisReferences(params.experimentRecord, dictionary, ids);
    } catch (cause) {
        const conflict = cause as { message?: string; code?: string; status?: number };
        return fail(conflict.message ?? "分析引用无效", conflict.code ?? "INVALID_REFERENCE", conflict.status ?? 409);
    }
    const analysisAppendices = referenced.map(row => ({
        ...analysisView(row, params.experimentRecord, dictionary),
        evidence: row.evidence,
        stale: false,
    }));

    const samplePlan = normalizeSamplePlanData(
        parseStoredJson<Record<string, unknown>>(params.experimentRecord.samplePlan),
        populationSize,
    );
    const storedSamplingResults = parseStoredJson<Record<string, unknown>>(params.experimentRecord.samplingResults);
    let targetMetrics: TargetAnalysisMetrics | null = null;
    let frozenWaveViews: ExperimentWaveView[] = [];

    if (sourceData) {
        const hydrated = hydrateSamplingResults(
            storedSamplingResults,
            sourceData.designRows,
        );
        if (!hydrated.ok) return fail(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
        if (!(await verifySamplingReplay({
            samplingResults: storedSamplingResults,
            population: sourceData.designRows,
            fieldMapping: params.taskInfo.fieldMapping,
        }))) return fail(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);

        const activeFormalWaveNumber = Math.max(2, params.experimentRecord.activeWaveNumber || 2);
        for (const w of storedWaves) {
            const rawWaveSampling = w.samplingResults as Record<string, Record<string, unknown> | undefined> | null;
            const hasUntrustedCompleted = SAMPLING_METHODS.some((m) =>
                isCompletedSamplingResult(rawWaveSampling?.[m]) && rawWaveSampling?.[m]?.serverGenerated !== true,
            );
            if (hasUntrustedCompleted) {
                return fail(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
            }
            const completedMethods = SAMPLING_METHODS.filter((m) =>
                isCompletedSamplingResult(rawWaveSampling?.[m])
                && rawWaveSampling?.[m]?.serverGenerated === true,
            );
            if ((w.waveNumber === 1 || w.waveNumber === activeFormalWaveNumber) && completedMethods.length === 0) {
                return fail("请先完成各轮次的抽样与问卷发放回收后再提交", "INCOMPLETE", 400);
            }
            if (w.samplingResults && !(await verifySamplingReplay({
                samplingResults: w.samplingResults,
                population: sourceData.designRows,
                fieldMapping: params.taskInfo.fieldMapping,
            }))) {
                return fail(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
            }
            for (const m of completedMethods) {
                const sectionIndices = rawWaveSampling?.[m]?.indices;
                const fwRecords = w.fieldwork?.methods?.[m]?.records;
                if (
                    !Array.isArray(sectionIndices)
                    || sectionIndices.length === 0
                    || !Array.isArray(fwRecords)
                    || fwRecords.length !== sectionIndices.length
                ) {
                    return fail("请先完成各轮次的问卷发放回收后再提交", "INCOMPLETE", 400);
                }
            }
        }
        if (!verifyExperimentWavesReplay({
            waves: storedWaves,
            population: sourceData.designRows,
            fieldMapping: params.taskInfo.fieldMapping,
            fieldworkConfig: params.taskInfo.fieldworkConfig,
            dictionary,
        })) {
            return fail("问卷发放回收记录重放校验失败，请联系管理员", INVALID_SAMPLING_STORAGE_CODE, 500);
        }

        frozenWaveViews = hydrateWaveViews({
            waves: storedWaves,
            population: sourceData.designRows,
            populationSize,
            fieldMapping: params.taskInfo.fieldMapping,
            fieldworkConfig: params.taskInfo.fieldworkConfig,
            dictionary,
        });

        targetMetrics = buildAnalysisMetrics({
            population: sourceData.designRows,
            fieldMapping: parseTopicFieldMapping(params.taskInfo.fieldMapping),
            samplingResults: hydrated.value as Parameters<typeof buildAnalysisMetrics>[0]["samplingResults"],
            samplePlan,
            topicName: params.taskInfo.topicName,
            targetUnit: resolveTargetUnit(params.taskInfo.fieldMapping, dictionary),
        }).target;
    }

    const samplingResults = compactSamplingResults(storedSamplingResults);
    const snapshot: SubmissionSnapshot = {
        topicName: params.taskInfo.topicName ?? "未命名商业课题",
        studentName: params.student.name || params.student.studentId,
        populationSize,
        questionnaire,
        samplePlan: samplePlan as Record<string, unknown> | null,
        samplingResults,
        adjustmentPlan: parseAdjustmentPlan(parseStoredJson(params.experimentRecord.adjustmentPlan)),
        waves: frozenWaveViews,
        studyContract: resolveStudyContract(params.taskInfo.fieldMapping, { topicName: params.taskInfo.topicName }),
        fieldworkConfig: resolveFieldworkConfig(params.taskInfo.fieldworkConfig),
        reportContent: params.experimentRecord.reportContent ?? "",
        weightConfig: scoringWeightsFrom(params.taskInfo.weightConfig),
        samplingPolicy: resolveSamplingPolicy(params.taskInfo.samplingPolicy),
        variableDictionary: dictionary,
        analysisAppendices,
        targetMetrics,
        className: params.taskInfo.className ?? null,
        teacherName: params.taskInfo.teacherName ?? null,
        populationFileSha256: sourceData?.fileHash ?? null,
        parserVersion: sourceData?.parserVersion ?? "raw-values-v1",
        samplingAlgorithmVersion: "business-sampling-v3",
    };
    const submittedAt = new Date();

    const updated = await db
        .update(experiment)
        .set({
            status: ExperimentStatus.SUBMITTED,
            version: versionResult.value + 1,
            submissionSnapshot: snapshot,
            submittedAt,
            scoreQuestionnaire: null,
            scoreProcess: null,
            scoreReport: null,
            totalScore: null,
            teacherComment: null,
            rejectReason: null,
            gradedByTeacherId: null,
            gradedAt: null,
            updatedAt: submittedAt,
        })
        .where(and(
            eq(experiment.id, params.experimentRecord.id),
            eq(experiment.version, versionResult.value),
            eq(experiment.status, params.experimentRecord.status),
            eq(experiment.currentStage, params.experimentRecord.currentStage),
        ))
        .returning({ id: experiment.id });

    if (!updated.length) return fail("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
    return { ok: true as const, experimentId: params.experimentRecord.id, submittedAt };
}
