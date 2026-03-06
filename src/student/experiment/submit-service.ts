import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment, submission } from "../../db/schema";
import { scheduleSubmissionPdfGeneration } from "./submission-pdf";
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

function fail(message: string, code: string, status = 400): SubmitFailure {
    return { ok: false, message, code, status };
}

function getAffectedRows(result: unknown) {
    if (!result || typeof result !== "object") return 0;
    const value = (result as { affectedRows?: unknown }).affectedRows;
    return typeof value === "number" ? value : 0;
}

function normalizePopulationSize(populationSize: SubmitTaskInfo["populationSize"]) {
    if (populationSize === null || populationSize === undefined) return null;
    const parsed = Number(populationSize);
    return Number.isFinite(parsed) ? parsed : null;
}

export function validateExperimentSubmission(params: {
    experimentRecord: ExperimentRecord;
    taskInfo: SubmitTaskInfo;
}) {
    const exp = params.experimentRecord;

    if (exp.status === ExperimentStatus.SUBMITTED) return fail("实验已提交，请勿重复提交", "ALREADY_SUBMITTED");
    if (exp.status === ExperimentStatus.GRADED) return fail("实验已批改完成", "ALREADY_GRADED");
    if (exp.status === ExperimentStatus.REJECTED) return fail("实验已被驳回，请先重置后再提交", "REJECTED_NEED_RESET");
    if (exp.currentStage < 4) return fail("请完成所有实验阶段后再提交", "INCOMPLETE");

    const questionnaireError = validateQuestionnaireForSubmit(exp.questionnaire);
    if (questionnaireError) return fail(questionnaireError, "INCOMPLETE");

    const normalizedPopulationSize = normalizePopulationSize(params.taskInfo.populationSize);
    const samplePlanError = validateSamplePlanForSubmit(exp.samplePlan, normalizedPopulationSize);
    if (samplePlanError) return fail(samplePlanError, "INCOMPLETE");

    const targetSampleSize = getTargetSampleSizeFromSamplePlan(exp.samplePlan);
    const samplingResultsError = validateSamplingResultsForSubmit(exp.samplingResults, targetSampleSize);
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
    const validation = validateExperimentSubmission({
        experimentRecord: params.experimentRecord,
        taskInfo: params.taskInfo,
    });
    if (!validation.ok) {
        return validation;
    }

    const lastSavedAt = new Date();
    const [submitUpdateResult] = await db
        .update(experiment)
        .set({
            status: ExperimentStatus.SUBMITTED,
            version: params.experimentRecord.version + 1,
            lastSavedAt,
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

    const submittedAt = new Date();
    const [submissionResult] = await db.insert(submission).values({
        experimentId: params.experimentRecord.id,
        status: ExperimentStatus.SUBMITTED,
        submittedAt,
    });

    const submissionId = submissionResult.insertId as number;

    scheduleSubmissionPdfGeneration({
        submissionId,
        taskId: params.taskId,
        teacherId: params.taskInfo.teacherId ?? null,
        studentId: params.student.id,
        studentName: params.student.name ?? "",
        topicName: params.taskInfo.topicName ?? "",
        questionnaire: params.experimentRecord.questionnaire as any | null,
        reportContent: params.experimentRecord.reportContent ?? "",
    });

    try {
        await notifySubmissionReviewers({
            classId: params.taskInfo.classId ?? null,
            teacherId: params.taskInfo.teacherId ?? null,
            submissionId,
            studentIdText: params.student.studentId,
            studentName: params.student.name ?? "",
            topicName: params.taskInfo.topicName ?? "未命名课题",
        });
    } catch (error) {
        console.error("Failed to notify teacher/assistants on submission:", error);
    }

    return { ok: true as const, submissionId, submittedAt, lastSavedAt };
}
