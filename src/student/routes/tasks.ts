import { and, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { experiment, submission, task, topic, topicAttachment, topicRecommendQuestion } from "../../db/schema";
import { error, getRouteParam, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getConfigNumber } from "../../server/system-config";
import { ExperimentStatus } from "../experiment/status";
import { requireAuth } from "./auth";

function isLockActive(lockedAt: Date | null, lockTimeoutMinutes: number) {
    if (!lockedAt) return false;
    const expiresAt = lockedAt.getTime() + lockTimeoutMinutes * 60 * 1000;
    return Date.now() < expiresAt;
}

function getVisibleRejectReason(status: string, rejectReason: string | null | undefined) {
    return status === "rejected" ? (rejectReason ?? undefined) : undefined;
}

async function isTopicDeletedForTask(taskId: number, classId: number) {
    const [deletedRow] = await db
        .select({ id: task.id })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(
            and(
                eq(task.id, taskId),
                eq(task.classId, classId),
                or(isNotNull(task.deletedAt), eq(topic.isDeleted, 1), isNotNull(topic.deletedAt))
            )
        );
    return Boolean(deletedRow);
}

const tasksRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const tasks = await db
            .select({
                id: task.id,
                topicId: task.topicId,
                classId: task.classId,
                openTime: task.openTime,
                deadline: task.deadline,
                createdAt: task.createdAt,
                topicName: topic.name,
                topicDescription: topic.description,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(task.classId, currentStudent.classId), isNull(task.deletedAt), eq(topic.status, 1), eq(topic.isDeleted, 0)))
            .orderBy(desc(task.createdAt));

        const taskIds = tasks.map((t) => t.id);
        const experiments =
            taskIds.length > 0
                ? await db
                    .select({
                        id: experiment.id,
                        taskId: experiment.taskId,
                        currentStage: experiment.currentStage,
                        status: experiment.status,
                        lastSavedAt: experiment.lastSavedAt,
                    })
                    .from(experiment)
                    .where(and(eq(experiment.studentId, currentStudent.id), sql`${experiment.taskId} IN (${sql.join(taskIds, sql`, `)})`))
                : [];

        const experimentMap = new Map(experiments.map((e) => [e.taskId, e]));

        const experimentIds = experiments.map((e) => e.id);
        const submissions =
            experimentIds.length > 0
                ? await db
                    .select({
                        experimentId: submission.experimentId,
                        totalScore: submission.totalScore,
                        rejectReason: submission.rejectReason,
                        status: submission.status,
                        lockedById: submission.lockedById,
                        lockedAt: submission.lockedAt,
                    })
                    .from(submission)
                    .innerJoin(experiment, eq(submission.experimentId, experiment.id))
                    .where(and(eq(experiment.studentId, currentStudent.id), sql`${experiment.id} IN (${sql.join(experimentIds, sql`, `)})`))
                    .orderBy(desc(submission.submittedAt))
                : [];

        const submissionMap = new Map<number, (typeof submissions)[0]>();
        for (const sub of submissions) {
            if (!submissionMap.has(sub.experimentId)) {
                submissionMap.set(sub.experimentId, sub);
            }
        }

        const lockTimeoutMinutes = await getConfigNumber("grading.lock_timeout_minutes", 30);

        const result = tasks.map((t) => {
            const exp = experimentMap.get(t.id);
            const sub = exp ? submissionMap.get(exp.id) : null;
            const gradingActive = !!sub?.lockedById && isLockActive(sub.lockedAt ?? null, lockTimeoutMinutes);

            let status: string;
            let progress = 0;

            if (!exp) {
                status = "not_started";
            } else if (exp.status === ExperimentStatus.REJECTED) {
                status = "rejected";
                progress = 100;
            } else if (exp.status === ExperimentStatus.GRADED) {
                status = "graded";
                progress = 100;
            } else if (exp.status === ExperimentStatus.SUBMITTED) {
                if (sub?.status === 2) {
                    status = "graded";
                } else if (sub?.status === 3) {
                    status = "rejected";
                } else if (gradingActive) {
                    status = "grading";
                } else {
                    status = "submitted";
                }
                progress = 100;
            } else {
                status = "in_progress";
                progress = Math.round((Math.min(exp.currentStage, 4) / 4) * 100);
            }

            return {
                id: t.id,
                topicId: t.topicId,
                name: t.topicName,
                description: t.topicDescription,
                publishedAt: (t.openTime ?? t.createdAt).toISOString(),
                deadline: t.deadline?.toISOString() ?? null,
                status,
                progress,
                currentStage: exp?.currentStage ?? 0,
                score: sub?.totalScore === null || sub?.totalScore === undefined ? undefined : Number(sub.totalScore),
                rejectReason: getVisibleRejectReason(status, sub?.rejectReason),
            };
        });

        return json(result);
    },
};

const taskDetailRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!taskId) {
            return error("无效的任务ID", "INVALID_ID");
        }

        const [taskInfo] = await db
            .select({
                id: task.id,
                topicId: task.topicId,
                classId: task.classId,
                openTime: task.openTime,
                deadline: task.deadline,
                createdAt: task.createdAt,
                topicName: topic.name,
                topicDescription: topic.description,
                excelRowCount: topic.excelRowCount,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(task.id, taskId), eq(task.classId, currentStudent.classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

        if (!taskInfo) {
            if (await isTopicDeletedForTask(taskId, currentStudent.classId)) {
                return error("课题已删除", "TOPIC_DELETED", 410);
            }
            return error("任务不存在", "NOT_FOUND", 404);
        }

        const attachments = await db
            .select({
                id: topicAttachment.id,
                fileName: topicAttachment.fileName,
                fileType: topicAttachment.fileType,
                fileSize: topicAttachment.fileSize,
            })
            .from(topicAttachment)
            .where(eq(topicAttachment.topicId, taskInfo.topicId));

        const recommendQuestions = await db
            .select({
                id: topicRecommendQuestion.id,
                questionType: topicRecommendQuestion.questionType,
                content: topicRecommendQuestion.content,
                options: topicRecommendQuestion.options,
                sortOrder: topicRecommendQuestion.sortOrder,
            })
            .from(topicRecommendQuestion)
            .where(eq(topicRecommendQuestion.topicId, taskInfo.topicId))
            .orderBy(topicRecommendQuestion.sortOrder);

        const [exp] = await db
            .select()
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        let submissionInfo = null;
        if (exp) {
            const [sub] = await db
                .select()
                .from(submission)
                .where(eq(submission.experimentId, exp.id))
                .orderBy(desc(submission.submittedAt))
                .limit(1);
            submissionInfo = sub ?? null;
        }

        const lockTimeoutMinutes = await getConfigNumber("grading.lock_timeout_minutes", 30);
        const gradingActive = submissionInfo?.lockedById ? isLockActive(submissionInfo.lockedAt ?? null, lockTimeoutMinutes) : false;

        let status: string;
        if (!exp) {
            status = "not_started";
        } else if (exp.status === ExperimentStatus.REJECTED) {
            status = "rejected";
        } else if (exp.status === ExperimentStatus.GRADED) {
            status = "graded";
        } else if (exp.status === ExperimentStatus.SUBMITTED) {
            if (submissionInfo?.status === 2) {
                status = "graded";
            } else if (submissionInfo?.status === 3) {
                status = "rejected";
            } else if (gradingActive) {
                status = "grading";
            } else {
                status = "submitted";
            }
        } else {
            status = "in_progress";
        }

        return json({
            id: taskInfo.id,
            topicId: taskInfo.topicId,
            name: taskInfo.topicName,
            description: taskInfo.topicDescription,
            publishedAt: (taskInfo.openTime ?? taskInfo.createdAt).toISOString(),
            deadline: taskInfo.deadline?.toISOString() ?? null,
            populationSize: taskInfo.excelRowCount ?? 10000,
            attachments: attachments.map((a) => ({
                id: a.id,
                name: a.fileName,
                type: a.fileType,
                size: a.fileSize,
            })),
            recommendQuestions,
            status,
            currentStage: exp?.currentStage ?? 0,
            score: submissionInfo?.totalScore === null || submissionInfo?.totalScore === undefined
                ? undefined
                : Number(submissionInfo.totalScore),
            rejectReason: getVisibleRejectReason(status, submissionInfo?.rejectReason),
        });
    },
};

export { taskDetailRoutes, tasksRoutes };
