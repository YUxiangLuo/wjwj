import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { experiment, task, topic, topicAttachment } from "../../db/schema";
import { experimentProgress } from "../../lib/experiment-progress";
import { normalizeRecommendQuestionsFromDb } from "../../lib/questionnaire-normalize";
import { error, getPositiveRouteId, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getStudentTaskAccessError } from "../experiment/task-access";
import { requireAuth } from "./auth";
import { resolveSamplingPolicy } from "../../lib/sampling-policy";

function visibleStatus(status: typeof experiment.$inferSelect.status | null) {
    return status ?? "not_started";
}

const tasksRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;

        const rows = await db
            .select({
                id: task.id,
                topicId: task.topicId,
                openTime: task.openTime,
                deadline: task.deadline,
                createdAt: task.createdAt,
                name: topic.name,
                description: topic.description,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(
                eq(task.classId, auth.student.classId),
                eq(topic.status, 1),
            ))
            .orderBy(desc(task.createdAt));

        const taskIds = rows.map((row) => row.id);
        const experiments = taskIds.length
            ? await db
                .select({
                    id: experiment.id,
                    taskId: experiment.taskId,
                    status: experiment.status,
                    currentStage: experiment.currentStage,
                    stage4CompletedAt: experiment.stage4CompletedAt,
                    totalScore: experiment.totalScore,
                    rejectReason: experiment.rejectReason,
                })
                .from(experiment)
                .where(and(
                    eq(experiment.studentId, auth.student.id),
                    sql`${experiment.taskId} IN (${sql.join(taskIds, sql`, `)})`,
                ))
            : [];
        const experimentByTask = new Map(experiments.map((row) => [row.taskId, row]));

        return json(rows.map((row) => {
            const record = experimentByTask.get(row.id) ?? null;
            return {
                id: row.id,
                topicId: row.topicId,
                name: row.name,
                description: row.description,
                publishedAt: (row.openTime ?? row.createdAt).toISOString(),
                deadline: row.deadline?.toISOString() ?? null,
                status: visibleStatus(record?.status ?? null),
                progress: experimentProgress(record),
                currentStage: record?.currentStage ?? 0,
                score: record?.totalScore == null ? undefined : Number(record.totalScore),
                rejectReason: record?.status === "rejected" ? (record.rejectReason ?? undefined) : undefined,
            };
        }));
    },
};

const taskDetailRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error || !auth.student) return auth.error!;
        const taskId = getPositiveRouteId(req);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const [taskInfo] = await db
            .select({
                id: task.id,
                topicId: task.topicId,
                openTime: task.openTime,
                deadline: task.deadline,
                createdAt: task.createdAt,
                name: topic.name,
                description: topic.description,
                populationSize: topic.excelRowCount,
                recommendQuestions: topic.recommendQuestions,
                samplingPolicy: topic.samplingPolicy,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(
                eq(task.id, taskId),
                eq(task.classId, auth.student.classId),
                eq(topic.status, 1),
            ));
        if (!taskInfo) {
            return (await getStudentTaskAccessError(taskId, auth.student.classId))
                ?? error("任务不存在", "NOT_FOUND", 404);
        }

        const [attachments, records] = await Promise.all([
            db.select({
                id: topicAttachment.id,
                fileName: topicAttachment.fileName,
                fileType: topicAttachment.fileType,
                fileSize: topicAttachment.fileSize,
            }).from(topicAttachment).where(eq(topicAttachment.topicId, taskInfo.topicId)),
            db.select({
                status: experiment.status,
                currentStage: experiment.currentStage,
                totalScore: experiment.totalScore,
                rejectReason: experiment.rejectReason,
            }).from(experiment).where(and(
                eq(experiment.studentId, auth.student.id),
                eq(experiment.taskId, taskId),
            )),
        ]);
        const record = records[0];

        return json({
            id: taskInfo.id,
            topicId: taskInfo.topicId,
            name: taskInfo.name,
            description: taskInfo.description,
            publishedAt: (taskInfo.openTime ?? taskInfo.createdAt).toISOString(),
            deadline: taskInfo.deadline?.toISOString() ?? null,
            populationSize: taskInfo.populationSize || 10_000,
            attachments: attachments.map((item) => ({
                id: item.id,
                name: item.fileName,
                type: item.fileType,
                size: item.fileSize,
            })),
            recommendQuestions: normalizeRecommendQuestionsFromDb(taskInfo.recommendQuestions),
            samplingPolicy: resolveSamplingPolicy(taskInfo.samplingPolicy),
            status: visibleStatus(record?.status ?? null),
            currentStage: record?.currentStage ?? 0,
            score: record?.totalScore == null ? undefined : Number(record.totalScore),
            rejectReason: record?.status === "rejected" ? (record.rejectReason ?? undefined) : undefined,
        });
    },
};

export { taskDetailRoutes, tasksRoutes };
