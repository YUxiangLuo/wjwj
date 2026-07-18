import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { experiment, task, teacher, topic } from "../../db/schema";
import { scoringWeightsFrom } from "../../lib/scoring-weights";
import { parseStoredJson } from "../experiment/serialization";
import { error, getRouteParam, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getStudentTaskAccessError } from "../experiment/task-access";
import { requireAuth } from "./auth";

function score(value: string | null) {
    return value == null ? null : Number(value);
}

const submissionByTaskRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");
        const accessError = await getStudentTaskAccessError(taskId, auth.student.classId);
        if (accessError) return accessError;

        const [row] = await db
            .select({
                id: experiment.id,
                taskId: experiment.taskId,
                topicId: topic.id,
                topicName: topic.name,
                status: experiment.status,
                submittedAt: experiment.submittedAt,
                scoreQuestionnaire: experiment.scoreQuestionnaire,
                scoreProcess: experiment.scoreProcess,
                scoreReport: experiment.scoreReport,
                totalScore: experiment.totalScore,
                teacherComment: experiment.teacherComment,
                rejectReason: experiment.rejectReason,
                gradedAt: experiment.gradedAt,
                graderName: teacher.name,
                weightConfig: topic.weightConfig,
                submissionSnapshot: experiment.submissionSnapshot,
            })
            .from(experiment)
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .leftJoin(teacher, eq(experiment.gradedByTeacherId, teacher.id))
            .where(and(eq(experiment.studentId, auth.student.id), eq(experiment.taskId, taskId)));

        if (!row || row.status === "in_progress") return error("尚未提交实验", "NOT_FOUND", 404);
        const snapshot = parseStoredJson<{ weightConfig?: unknown }>(row.submissionSnapshot);
        return json({
            id: row.id,
            taskId: row.taskId,
            topicId: row.topicId,
            topicName: row.topicName,
            submittedAt: row.submittedAt?.toISOString() ?? null,
            status: row.status,
            scoreQuestionnaire: score(row.scoreQuestionnaire),
            scoreProcess: score(row.scoreProcess),
            scoreReport: score(row.scoreReport),
            totalScore: score(row.totalScore),
            teacherComment: row.teacherComment,
            rejectReason: row.rejectReason,
            gradedAt: row.gradedAt?.toISOString() ?? null,
            graderName: row.graderName,
            weights: scoringWeightsFrom(snapshot?.weightConfig ?? row.weightConfig),
        });
    },
};

export { submissionByTaskRoutes };
