import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment, submission } from "../../db/schema";
import { getAffectedRows } from "../../db/utils";
import { kickSubmissionPdfProcessing } from "./submission-pdf";
import { SubmissionPdfStatus } from "./pdf-status";
import { parseStoredJson } from "./serialization";
import { ExperimentStatus } from "./status";
import {
    getTargetSampleSizeFromSamplePlan,
    validateQuestionnaireForSubmit,
    validateReportForSubmit,
    validateSamplePlanForSubmit,
    validateSamplingResultsForSubmit,
} from "./submit-validation";
import { notifySubmissionReviewers } from "./workflow";

type ExperimentRecord = typeof experiment.$inferSelect;

interface SubmitTaskInfo {
    topicName: string | null;
    populationSize: number | string | null;
    teacherId: number | null;
    classId: number | null;
}

interface SubmitStudentInfo {
    id: number;
    studentId: string;
    name?: string | null;
}

interface SubmitFailure {
    ok: false;
    code: string;
    message: string;
    status: number;
}

interface SubmitSuccess {
    submissionId: number;
    submittedAt: Date;
    lastSavedAt: Date;
}

function fail(message: string, code: string, status = 400): SubmitFailure {
    return { ok: false, message, code, status };
}

function normalizePopulationSize(populationSize: SubmitTaskInfo["populationSize"]) {
    if (populationSize === null || populationSize === undefined) return null;
    const parsed = Number(populationSize);
    return Number.isFinite(parsed) ? parsed : null;
}

function isSubmitFailure(result: SubmitFailure | SubmitSuccess): result is SubmitFailure {
    return "ok" in result && result.ok === false;
}

export function validateExperimentSubmission(params: {
    experimentRecord: ExperimentRecord;
    taskInfo: SubmitTaskInfo;
}) {
    const exp = params.experimentRecord;
    const questionnaire = parseStoredJson<Record<string, unknown>>(exp.questionnaire);
    const samplePlan = parseStoredJson<Record<string, unknown>>(exp.samplePlan);
    const samplingResults = parseStoredJson<Record<string, unknown>>(exp.samplingResults);

    if (exp.status === ExperimentStatus.SUBMITTED) return fail("实验已提交，请勿重复提交", "ALREADY_SUBMITTED");
    if (exp.status === ExperimentStatus.GRADED) return fail("实验已批改完成", "ALREADY_GRADED");
    if (exp.status === ExperimentStatus.REJECTED) return fail("实验已被驳回，请先重置后再提交", "REJECTED_NEED_RESET");
    if (exp.currentStage < 4) return fail("请完成所有实验阶段后再提交", "INCOMPLETE");

    const questionnaireError = validateQuestionnaireForSubmit(questionnaire);
    if (questionnaireError) return fail(questionnaireError, "INCOMPLETE");

    const normalizedPopulationSize = normalizePopulationSize(params.taskInfo.populationSize);
    const samplePlanError = validateSamplePlanForSubmit(samplePlan, normalizedPopulationSize);
    if (samplePlanError) return fail(samplePlanError, "INCOMPLETE");

    const targetSampleSize = getTargetSampleSizeFromSamplePlan(samplePlan);
    const samplingResultsError = validateSamplingResultsForSubmit(samplingResults, targetSampleSize);
    if (samplingResultsError) return fail(samplingResultsError, "INCOMPLETE");

    const reportError = validateReportForSubmit(exp.reportContent);
    if (reportError) return fail(reportError, "INCOMPLETE");

    return { ok: true as const };
}

export async function submitStudentExperiment(params: {
    experimentRecord: ExperimentRecord;
    taskId: number;
    taskInfo: SubmitTaskInfo;
    student: SubmitStudentInfo;
}) {
    const questionnaire = parseStoredJson<Record<string, unknown>>(params.experimentRecord.questionnaire);

    const validation = validateExperimentSubmission({
        experimentRecord: params.experimentRecord,
        taskInfo: params.taskInfo,
    });
    if (!validation.ok) {
        return validation;
    }

    const transactionResult: SubmitFailure | SubmitSuccess = await db.transaction(async (tx) => {
        const nextLastSavedAt = new Date();
        const [submitUpdateResult] = await tx
            .update(experiment)
            .set({
                status: ExperimentStatus.SUBMITTED,
                version: params.experimentRecord.version + 1,
                lastSavedAt: nextLastSavedAt,
            })
            .where(
                and(
                    eq(experiment.id, params.experimentRecord.id),
                    eq(experiment.version, params.experimentRecord.version)
                )
            );

        if (getAffectedRows(submitUpdateResult) === 0) {
            return fail("实验记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        }

        const nextSubmittedAt = new Date();
        const [submissionResult] = await tx.insert(submission).values({
            experimentId: params.experimentRecord.id,
            pdfSnapshotQuestionnaire: questionnaire,
            pdfSnapshotReportContent: params.experimentRecord.reportContent ?? "",
            pdfSnapshotTopicName: params.taskInfo.topicName ?? "未命名课题",
            pdfSnapshotStudentName: params.student.name ?? params.student.studentId,
            status: ExperimentStatus.SUBMITTED,
            pdfStatus: SubmissionPdfStatus.PENDING,
            submittedAt: nextSubmittedAt,
        });

        const nextSubmissionId = submissionResult.insertId as number;

        await notifySubmissionReviewers({
            classId: params.taskInfo.classId ?? null,
            teacherId: params.taskInfo.teacherId ?? null,
            submissionId: nextSubmissionId,
            studentIdText: params.student.studentId,
            studentName: params.student.name ?? "",
            topicName: params.taskInfo.topicName ?? "未命名课题",
        }, tx);

        return {
            submissionId: nextSubmissionId,
            submittedAt: nextSubmittedAt,
            lastSavedAt: nextLastSavedAt,
        };
    });

    if (isSubmitFailure(transactionResult)) {
        return transactionResult;
    }

    const { submissionId, submittedAt, lastSavedAt } = transactionResult;

    // Best-effort inline kick for fast feedback; durable retry is handled by the PDF background job.
    kickSubmissionPdfProcessing();

    return { ok: true as const, submissionId, submittedAt, lastSavedAt };
}
