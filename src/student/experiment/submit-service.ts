import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment } from "../../db/schema";
import { validateObservedVersion } from "../../lib/observed-version";
import { resolveAnalysisTarget } from "../../lib/analysis-target";
import { scoringWeightsFrom, type ScoringWeights } from "../../lib/scoring-weights";
import { resolveSamplingPolicy, type SamplingPolicyV1 } from "../../lib/sampling-policy";
import { readVariableSource } from "../../server/variable-source";
import { finitePopulationS2ToSigma2 } from "./sample-plan";
import { buildPopulationNumericStats, parseTopicFieldMapping } from "../../domain/statistics/population";
import { buildAnalysisMetrics } from "../../domain/statistics/analysis";
import { validateQuestionBindings } from "../../domain/variables/question-binding";
import type { TargetAnalysisMetrics } from "../../domain/experiment/analysis-types";
import type { SavedAnalysisView, VariableDictionary } from "../../domain/variables/types";
import { normalizeSamplePlanData } from "./sample-plan-display";
import { analysisView, loadAnalysisReferences, parseAnalysisReferences } from "./saved-analysis-service";
import { parseStoredJson } from "./serialization";
import { compactSamplingResults, hydrateSamplingResults, INVALID_SAMPLING_STORAGE_CODE, INVALID_SAMPLING_STORAGE_MESSAGE } from "./sampling-storage";
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
    if (record.currentStage !== 4 || !record.stage4CompletedAt) return fail("请完成所有实验阶段后再提交", "INCOMPLETE");

    const questionnaire = parseStoredJson(record.questionnaire);
    const samplePlan = parseStoredJson(record.samplePlan);
    const samplingResults = parseStoredJson(record.samplingResults);
    const populationSize = normalizePopulationSize(params.taskInfo.populationSize);

    const validationError =
        validateQuestionnaireForSubmit(questionnaire) ??
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
    try {
        validateQuestionBindings(questionnaire as any, dictionary, params.taskInfo.taskId ?? params.experimentRecord.taskId);
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
    // 提交时用同一份总体再复核一次：阶段完成后的换源或伪造方差不得通过。
    const resolvedTarget = resolveAnalysisTarget(params.taskInfo.fieldMapping);
    if (resolvedTarget?.target.kind === "mean" && sourceData) {
        // 与阶段完成一致：把总体 S²（分母 N−1）换成规划使用的 σ²（分母 N）。
        const stat = buildPopulationNumericStats(sourceData.rows, [resolvedTarget.target.field])[resolvedTarget.target.field];
        const actualVariance = stat ? finitePopulationS2ToSigma2(stat.variance, stat.count) : null;
        const varianceError = validateMeanPlanVariance(
            parseStoredJson(params.experimentRecord.samplePlan),
            resolvedTarget.target.kind,
            actualVariance,
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
    let targetMetrics: TargetAnalysisMetrics | null = null;
    if (sourceData) {
        const hydrated = hydrateSamplingResults(
            parseStoredJson(params.experimentRecord.samplingResults),
            sourceData.designRows,
        );
        if (!hydrated.ok) return fail(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
        targetMetrics = buildAnalysisMetrics({
            population: sourceData.designRows,
            fieldMapping: parseTopicFieldMapping(params.taskInfo.fieldMapping),
            samplingResults: hydrated.value as Parameters<typeof buildAnalysisMetrics>[0]["samplingResults"],
            samplePlan,
            topicName: params.taskInfo.topicName,
            targetUnit: resolveTargetUnit(params.taskInfo.fieldMapping, dictionary),
        }).target;
    }
    const samplingResults = compactSamplingResults(
        parseStoredJson<Record<string, unknown>>(params.experimentRecord.samplingResults),
    );
    const snapshot: SubmissionSnapshot = {
        topicName: params.taskInfo.topicName ?? "未命名实验模板",
        studentName: params.student.name || params.student.studentId,
        populationSize,
        questionnaire,
        samplePlan: samplePlan as Record<string, unknown> | null,
        samplingResults,
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
        samplingAlgorithmVersion: "sampling-v2",
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
