import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment } from "../../db/schema";
import { validateObservedVersion } from "../../lib/observed-version";
import { resolveAnalysisTarget } from "../../lib/analysis-target";
import { scoringWeightsFrom, type ScoringWeights } from "../../lib/scoring-weights";
import { resolveSamplingPolicy, type SamplingPolicyV1 } from "../../lib/sampling-policy";
import { resolveStoragePath } from "../../server/storage-files";
import { normalizeSamplePlanData } from "./sample-plan-display";
import { parseStoredJson } from "./serialization";
import { compactSamplingResults } from "./sampling-storage";
import { ExperimentStatus } from "./status";
import {
    getTargetSampleSizeFromSamplePlan,
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
    className?: string | null;
    teacherName?: string | null;
    populationFileSha256?: string | null;
    parserVersion?: string;
    samplingAlgorithmVersion?: string;
}

interface SubmitTaskInfo {
    topicName: string | null;
    populationSize: number | string | null;
    weightConfig?: unknown;
    fieldMapping?: unknown;
    samplingPolicy?: unknown;
    excelFilePath?: string | null;
    className?: string | null;
    teacherName?: string | null;
}

async function populationFileSha256(filePath: string | null | undefined) {
    if (!filePath) return null;
    try {
        const bytes = await Bun.file(resolveStoragePath(filePath)).arrayBuffer();
        return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    } catch {
        return null;
    }
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
            { allowLegacyAdvancedSourceWithoutSnapshot: true },
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
    const samplePlan = normalizeSamplePlanData(
        parseStoredJson<Record<string, unknown>>(params.experimentRecord.samplePlan),
        populationSize,
    );
    const samplingResults = compactSamplingResults(
        parseStoredJson<Record<string, unknown>>(params.experimentRecord.samplingResults),
    );
    const populationFileHash = await populationFileSha256(params.taskInfo.excelFilePath);
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
        className: params.taskInfo.className ?? null,
        teacherName: params.taskInfo.teacherName ?? null,
        populationFileSha256: populationFileHash,
        parserVersion: "spreadsheet-v2",
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
