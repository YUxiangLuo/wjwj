import { eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment } from "../../db/schema";
import { scoringWeightsFrom, type ScoringWeights } from "../../lib/scoring-weights";
import { normalizeSamplePlanData } from "./sample-plan-display";
import { parseStoredJson } from "./serialization";
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
}

interface SubmitTaskInfo {
    topicName: string | null;
    populationSize: number | string | null;
    weightConfig?: unknown;
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
        validateSamplePlanForSubmit(samplePlan, populationSize) ??
        validateSamplingResultsForSubmit(samplingResults, getTargetSampleSizeFromSamplePlan(samplePlan)) ??
        validateReportForSubmit(record.reportContent);
    return validationError ? fail(validationError, "INCOMPLETE") : { ok: true as const };
}

export async function submitStudentExperiment(params: {
    experimentRecord: ExperimentRecord;
    taskInfo: SubmitTaskInfo;
    student: SubmitStudentInfo;
}) {
    const validation = validateExperimentSubmission(params);
    if (!validation.ok) return validation;

    const populationSize = normalizePopulationSize(params.taskInfo.populationSize);
    const questionnaire = parseStoredJson<Record<string, unknown>>(params.experimentRecord.questionnaire);
    const samplePlan = normalizeSamplePlanData(
        parseStoredJson<Record<string, unknown>>(params.experimentRecord.samplePlan),
        populationSize,
    );
    const samplingResults = parseStoredJson<Record<string, unknown>>(params.experimentRecord.samplingResults);
    const snapshot: SubmissionSnapshot = {
        topicName: params.taskInfo.topicName ?? "未命名课题",
        studentName: params.student.name || params.student.studentId,
        populationSize,
        questionnaire,
        samplePlan: samplePlan as Record<string, unknown> | null,
        samplingResults,
        reportContent: params.experimentRecord.reportContent ?? "",
        weightConfig: scoringWeightsFrom(params.taskInfo.weightConfig),
    };
    const submittedAt = new Date();

    const updated = await db
        .update(experiment)
        .set({
            status: ExperimentStatus.SUBMITTED,
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
        .where(eq(experiment.id, params.experimentRecord.id))
        .returning({ id: experiment.id });

    if (!updated.length) return fail("实验记录不存在", "NOT_FOUND", 404);
    return { ok: true as const, experimentId: params.experimentRecord.id, submittedAt };
}
