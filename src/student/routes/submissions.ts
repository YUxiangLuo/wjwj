import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment, task, teacher, topic } from "../../db/schema";
import { scoringWeightsFrom } from "../../lib/scoring-weights";
import { readPopulationData } from "../experiment/population-data";
import { previewSamplingResults } from "../experiment/sampling-results-preview";
import {
    hydrateSamplingResults,
    inspectSamplingResultsStorage,
    INVALID_SAMPLING_STORAGE_CODE,
    INVALID_SAMPLING_STORAGE_MESSAGE,
} from "../experiment/sampling-storage";
import { readStoredDocument } from "@/lib/stored-document";
import { error, getPositiveRouteId, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getStudentTaskAccessError } from "../experiment/task-access";
import { requireAuth } from "./auth";
import { resolveSamplingPolicy } from "../../lib/sampling-policy";

function score(value: string | null) {
    return value == null ? null : Number(value);
}

const submissionByTaskRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getPositiveRouteId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;

        const [row] = await db
            .select({
                id: experiment.id,
                taskId: experiment.taskId,
                version: experiment.version,
                topicId: topic.id,
                topicName: topic.name,
                status: experiment.status,
                submittedAt: experiment.submittedAt,
                totalScore: experiment.totalScore,
                teacherComment: experiment.teacherComment,
                rejectReason: experiment.rejectReason,
                gradedAt: experiment.gradedAt,
                graderName: teacher.name,
                weightConfig: topic.weightConfig,
                samplingPolicy: topic.samplingPolicy,
                populationSize: topic.excelRowCount,
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
                submissionSnapshot: experiment.submissionSnapshot,
                questionnaire: experiment.questionnaire,
                samplePlan: experiment.samplePlan,
                samplingResults: experiment.samplingResults,
                reportContent: experiment.reportContent,
            })
            .from(experiment)
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .leftJoin(teacher, eq(experiment.gradedByTeacherId, teacher.id))
            .where(and(eq(experiment.studentId, auth.student.id), eq(experiment.taskId, taskId)));

        if (!row || row.status === "in_progress") return error("尚未提交实验", "NOT_FOUND", 404);
        const snapshot = readStoredDocument<{
            topicName?: string;
            studentName?: string;
            populationSize?: number | null;
            questionnaire?: unknown;
            samplePlan?: unknown;
            samplingResults?: unknown;
            reportContent?: string;
            weightConfig?: unknown;
            samplingPolicy?: unknown;
            variableDictionary?: import("@/domain/experiment/variable-dictionary").VariableDictionaryV1;
        }>(row.submissionSnapshot);
        const storedSamplingResults = snapshot?.samplingResults ?? readStoredDocument(row.samplingResults);
        const inspection = inspectSamplingResultsStorage(storedSamplingResults);
        if (!inspection.ok) return error(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
        let samplingResults = storedSamplingResults;
        if (inspection.needsPopulation) {
            if (!row.excelFilePath) return error("总体数据为空或读取失败", "READ_FAILED", 500);
            const population = await readPopulationData(row.excelFilePath, row.fieldMapping);
            if (!population.length) return error("总体数据为空或读取失败", "READ_FAILED", 500);
            const hydrated = hydrateSamplingResults(storedSamplingResults, population);
            if (!hydrated.ok) return error(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
            samplingResults = hydrated.value;
        }
        const snapshotContent = {
            topicName: snapshot?.topicName ?? row.topicName,
            studentName: snapshot?.studentName ?? auth.student.name,
            populationSize: snapshot?.populationSize ?? row.populationSize,
            questionnaire: snapshot?.questionnaire ?? readStoredDocument(row.questionnaire),
            ...(snapshot?.variableDictionary ? { variableDictionary: snapshot.variableDictionary } : {}),
            samplePlan: snapshot?.samplePlan ?? readStoredDocument(row.samplePlan),
            samplingResults: previewSamplingResults(samplingResults),
            samplingPolicy: resolveSamplingPolicy(snapshot?.samplingPolicy ?? row.samplingPolicy),
            reportContent: snapshot?.reportContent ?? row.reportContent ?? "",
        };
        return json({
            id: row.id,
            taskId: row.taskId,
            version: row.version,
            topicId: row.topicId,
            topicName: snapshotContent.topicName,
            submittedAt: row.submittedAt?.toISOString() ?? null,
            status: row.status,
            totalScore: score(row.totalScore),
            teacherComment: row.teacherComment,
            rejectReason: row.rejectReason,
            gradedAt: row.gradedAt?.toISOString() ?? null,
            graderName: row.graderName,
            weights: scoringWeightsFrom(snapshot?.weightConfig ?? row.weightConfig),
            snapshot: snapshotContent,
        });
    },
};

export { submissionByTaskRoutes };
