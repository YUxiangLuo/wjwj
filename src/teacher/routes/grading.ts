import { and, desc, eq, sql } from "drizzle-orm";
import { resolve, sep } from "node:path";
import { db } from "../../db";
import { assistant, assistantClass, class_, experiment, student, submission, task, teacher, topic } from "../../db/schema";
import { error, getRouteParam, getSearchParams, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import {
    ASSISTANT_USER_TYPE,
    TEACHER_USER_TYPE,
    getCurrentUser,
    isLockExpired,
    notifyStudentById,
} from "./auth";

async function getAccessibleClassIds(req: Request): Promise<{ classIds: number[]; isAssistant: boolean; userId: number } | null> {
    const user = await getCurrentUser(req);
    if (!user) return null;

    if (user.type === "teacher") {
        const classes = await db.select({ id: class_.id }).from(class_).where(eq(class_.teacherId, user.id));
        return { classIds: classes.map((c) => c.id), isAssistant: false, userId: user.id };
    }

    const assignedClasses = await db
        .select({ classId: assistantClass.classId })
        .from(assistantClass)
        .where(eq(assistantClass.assistantId, user.id));
    return { classIds: assignedClasses.map((c) => c.classId), isAssistant: true, userId: user.id };
}

export function resolveSubmissionPdfPath(pdfPath: string) {
    const baseDir = resolve(process.cwd(), "storage");
    const normalized = pdfPath.replace(/\\/g, "/").replace(/^\/+/, "");
    const relativePath = normalized.startsWith("storage/") ? normalized.slice("storage/".length) : normalized;
    const fullPath = resolve(baseDir, relativePath);

    const isInsideStorage = fullPath === baseDir || fullPath.startsWith(`${baseDir}${sep}`);
    if (!isInsideStorage) {
        throw new Error("INVALID_PATH");
    }

    return fullPath;
}

const gradingRoutes: RouteDefinition = {
    async GET(req) {
        const access = await getAccessibleClassIds(req);
        if (!access) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const { classIds } = access;

        if (classIds.length === 0) {
            return json([]);
        }

        const params = getSearchParams(req);
        const status = params.get("status");

        let query = db
            .select({
                id: submission.id,
                studentName: student.name,
                studentId: student.studentId,
                topic: topic.name,
                className: class_.name,
                submittedAt: submission.submittedAt,
                status: submission.status,
                score: submission.totalScore,
                gradedByType: submission.gradedByType,
                gradedById: submission.gradedById,
                gradedAt: submission.gradedAt,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(sql`${class_.id} IN (${sql.join(classIds, sql`, `)})`)
            .orderBy(desc(submission.submittedAt))
            .$dynamic();

        if (status === "pending") {
            query = query.where(eq(submission.status, 1));
        } else if (status === "draft") {
            query = query.where(eq(submission.status, 0));
        } else if (status === "graded") {
            query = query.where(eq(submission.status, 2));
        } else if (status === "rejected") {
            query = query.where(eq(submission.status, 3));
        }

        const rows = await query;

        const graderIds = rows
            .filter((r) => r.gradedByType === 2 && r.gradedById)
            .map((r) => r.gradedById!)
            .filter((id, idx, arr) => arr.indexOf(id) === idx);

        const assistantIds = rows
            .filter((r) => r.gradedByType === 3 && r.gradedById)
            .map((r) => r.gradedById!)
            .filter((id, idx, arr) => arr.indexOf(id) === idx);

        const teachers =
            graderIds.length > 0
                ? await db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(sql`${teacher.id} IN (${sql.join(graderIds, sql`, `)})`)
                : [];

        const assistants =
            assistantIds.length > 0
                ? await db.select({ id: assistant.id, name: assistant.name }).from(assistant).where(sql`${assistant.id} IN (${sql.join(assistantIds, sql`, `)})`)
                : [];

        const teacherMap = new Map(teachers.map((t) => [t.id, t.name]));
        const assistantMap = new Map(assistants.map((a) => [a.id, a.name]));

        const result = rows.map((row) => ({
            ...row,
            gradedByName:
                row.gradedByType === 2
                    ? (teacherMap.get(row.gradedById ?? 0) ?? "教师")
                    : row.gradedByType === 3
                        ? (assistantMap.get(row.gradedById ?? 0) ?? "助教")
                        : null,
        }));

        return json(result);
    }
};

const gradingDetailRoutes: RouteDefinition = {
    async GET(req) {
        const access = await getAccessibleClassIds(req);
        if (!access) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const { classIds, isAssistant, userId } = access;

        if (classIds.length === 0) return error("无权限访问", "FORBIDDEN", 403);

        const submissionId = Number(getRouteParam(req, "id"));

        if (isNaN(submissionId)) return error("Invalid ID", "INVALID_ID");

        const [row] = await db
            .select({
                id: submission.id,
                studentName: student.name,
                studentId: student.studentId,
                className: class_.name,
                topicName: topic.name,
                topicDesc: topic.description,
                weightConfig: topic.weightConfig,
                status: submission.status,
                submittedAt: submission.submittedAt,
                lockedById: submission.lockedById,
                lockedByType: submission.lockedByType,
                lockedAt: submission.lockedAt,
                experimentId: experiment.id,
                experimentStatus: experiment.status,
                reportContent: experiment.reportContent,
                samplePlan: experiment.samplePlan,
                questionnaire: experiment.questionnaire,
                samplingResults: experiment.samplingResults,
                questionnairePdfPath: submission.questionnairePdfPath,
                reportPdfPath: submission.reportPdfPath,
                scoreQuestionnaire: submission.scoreQuestionnaire,
                scoreProcess: submission.scoreProcess,
                scoreReport: submission.scoreReport,
                totalScore: submission.totalScore,
                teacherComment: submission.teacherComment,
                rejectReason: submission.rejectReason,
                gradedAt: submission.gradedAt,
                gradedByType: submission.gradedByType,
                gradedById: submission.gradedById,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(eq(submission.id, submissionId), sql`${class_.id} IN (${sql.join(classIds, sql`, `)})`));

        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);

        const now = new Date();
        const lockExpired = isLockExpired(row.lockedAt);
        const myUserType = isAssistant ? ASSISTANT_USER_TYPE : TEACHER_USER_TYPE;
        const lockedByOther = row.lockedById && (row.lockedByType !== myUserType || row.lockedById !== userId) && !lockExpired;

        if (!lockedByOther && row.status === 1) {
            await db.update(submission).set({
                lockedByType: myUserType,
                lockedById: userId,
                lockedAt: now,
            }).where(eq(submission.id, submissionId));
        }

        const weightConfig = typeof row.weightConfig === "string"
            ? (() => {
                try {
                    return JSON.parse(row.weightConfig as unknown as string);
                } catch {
                    return null;
                }
            })()
            : row.weightConfig;

        const weights = {
            questionnaire: weightConfig?.questionnaire ?? 30,
            process: weightConfig?.process ?? 30,
            report: weightConfig?.report ?? 40,
        };

        let gradedByName = null;
        if (row.gradedByType === 2 && row.gradedById) {
            const [t] = await db.select({ name: teacher.name }).from(teacher).where(eq(teacher.id, row.gradedById));
            gradedByName = t?.name ?? "教师";
        } else if (row.gradedByType === 3 && row.gradedById) {
            const [a] = await db.select({ name: assistant.name }).from(assistant).where(eq(assistant.id, row.gradedById));
            gradedByName = a?.name ?? "助教";
        }

        return json({
            ...row,
            weights,
            readonly: lockedByOther,
            isAssistant,
            gradedByName,
        });
    },

    async POST(req) {
        const access = await getAccessibleClassIds(req);
        if (!access) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const { classIds, isAssistant, userId } = access;

        if (classIds.length === 0) return error("无权限访问", "FORBIDDEN", 403);

        const submissionId = Number(getRouteParam(req, "id"));

        if (isNaN(submissionId)) return error("Invalid ID", "INVALID_ID");

        const body = await parseBody<{
            scoreQuestionnaire: number;
            scoreProcess: number;
            scoreReport: number;
            totalScore: number;
            comment: string;
            status: number;
            rejectReason?: string;
            action?: string; // "draft" = save without finalizing
        }>(req);

        const isDraft = body.action === "draft";

        // Validate score ranges before touching the DB
        const scores = [body.scoreQuestionnaire, body.scoreProcess, body.scoreReport];
        if (scores.some((s) => !Number.isFinite(s) || s < 0 || s > 100)) {
            return error("分项分数需在 0-100 之间", "VALIDATION_ERROR", 400);
        }

        if ((body.comment ?? "").length > 2000) {
            return error("教师评语不能超过2000字", "VALIDATION_ERROR", 400);
        }

        if (!isDraft && body.status === 3) {
            const reason = (body.rejectReason ?? "").trim();
            if (reason.length < 10 || reason.length > 1000) {
                return error("驳回理由长度需在10-1000字之间", "VALIDATION_ERROR", 400);
            }
        }

        const [detail] = await db
            .select({
                id: submission.id,
                status: submission.status,
                lockedById: submission.lockedById,
                lockedByType: submission.lockedByType,
                lockedAt: submission.lockedAt,
                experimentId: experiment.id,
                topicId: task.topicId,
                studentId: student.id,
                topicName: topic.name,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .where(and(eq(submission.id, submissionId), sql`${class_.id} IN (${sql.join(classIds, sql`, `)})`));

        if (!detail) return error("提交记录不存在", "NOT_FOUND", 404);

        // Prevent any modification (draft or final) of already-finalized submissions
        if (detail.status !== 1) {
            return error("该提交已批改完成，无法修改", "ALREADY_GRADED", 409);
        }

        const myUserType = isAssistant ? ASSISTANT_USER_TYPE : TEACHER_USER_TYPE;
        const lockExpired = isLockExpired(detail.lockedAt);
        if (detail.lockedById && (detail.lockedByType !== myUserType || detail.lockedById !== userId) && !lockExpired) {
            return error("该作业正在被他人批改", "LOCKED", 423);
        }

        const [topicRow] = await db.select({ weightConfig: topic.weightConfig }).from(topic).where(eq(topic.id, detail.topicId));

        const weightConfig = typeof topicRow?.weightConfig === "string"
            ? (() => {
                try {
                    return JSON.parse(topicRow.weightConfig as unknown as string);
                } catch {
                    return null;
                }
            })()
            : topicRow?.weightConfig;

        const weights = {
            questionnaire: weightConfig?.questionnaire ?? 30,
            process: weightConfig?.process ?? 30,
            report: weightConfig?.report ?? 40,
        };

        const totalScore =
            (body.scoreQuestionnaire * weights.questionnaire + body.scoreProcess * weights.process + body.scoreReport * weights.report) /
            100;

        if (isDraft) {
            // Save draft: store scores/comment without changing submission status, keep lock
            await db.update(submission).set({
                scoreQuestionnaire: String(body.scoreQuestionnaire),
                scoreProcess: String(body.scoreProcess),
                scoreReport: String(body.scoreReport),
                totalScore: String(Number(totalScore.toFixed(2))),
                teacherComment: body.comment,
                rejectReason: body.rejectReason ?? null,
                gradedById: userId,
                gradedByType: myUserType,
                lockedById: userId,
                lockedByType: myUserType,
                lockedAt: new Date(), // refresh lock
            }).where(eq(submission.id, submissionId));

            return json({ success: true });
        }

        await db.update(submission).set({
            scoreQuestionnaire: String(body.scoreQuestionnaire),
            scoreProcess: String(body.scoreProcess),
            scoreReport: String(body.scoreReport),
            totalScore: String(Number(totalScore.toFixed(2))),
            teacherComment: body.comment,
            rejectReason: body.status === 3 ? (body.rejectReason ?? "") : null,
            status: body.status,
            gradedAt: new Date(),
            gradedById: userId,
            gradedByType: myUserType,
            lockedById: null,
            lockedByType: null,
            lockedAt: null,
        }).where(eq(submission.id, submissionId));

        if (body.status === 2) {
            await db.update(experiment).set({ status: 2 }).where(eq(experiment.id, detail.experimentId));
            await notifyStudentById(detail.studentId, {
                type: "GRADE_COMPLETED",
                title: "作业已批改",
                content: `您提交的「${detail.topicName}」作业已批改完成，得分：${Number(totalScore.toFixed(2))}分`,
                relatedType: "task",
                relatedId: detail.topicId,
            });
        }
        if (body.status === 3) {
            await db.update(experiment).set({ status: 3 }).where(eq(experiment.id, detail.experimentId));
            await notifyStudentById(detail.studentId, {
                type: "GRADE_REJECTED",
                title: "作业被驳回",
                content: `您提交的「${detail.topicName}」作业已被驳回，请查看驳回理由并重新提交`,
                relatedType: "task",
                relatedId: detail.topicId,
            });
        }

        return json({ success: true });
    }
};

const teacherPdfDownloadRoutes: RouteDefinition = {
    async GET(req) {
        const access = await getAccessibleClassIds(req);
        if (!access) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        if (access.classIds.length === 0) return error("无权限访问", "FORBIDDEN", 403);

        const submissionId = Number(getRouteParam(req, "id"));
        const type = getRouteParam(req, "type");

        if (isNaN(submissionId)) return error("Invalid ID", "INVALID_ID");
        if (type !== "questionnaire" && type !== "report") return error("Invalid type", "INVALID_TYPE");

        const [row] = await db
            .select({
                questionnairePdfPath: submission.questionnairePdfPath,
                reportPdfPath: submission.reportPdfPath,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(eq(submission.id, submissionId), sql`${class_.id} IN (${sql.join(access.classIds, sql`, `)})`));

        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);

        const pdfPath = type === "questionnaire" ? row.questionnairePdfPath : row.reportPdfPath;
        if (!pdfPath) return error("文件不存在", "NOT_FOUND", 404);

        let fullPath: string;
        try {
            fullPath = resolveSubmissionPdfPath(pdfPath);
        } catch {
            return error("无效的文件路径", "INVALID_PATH", 400);
        }

        const file = Bun.file(fullPath);
        const exists = await file.exists();
        if (!exists) return error("文件不存在", "NOT_FOUND", 404);

        return new Response(file, {
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename=${type}-${submissionId}.pdf`,
            },
        });
    }
};

export { gradingDetailRoutes, gradingRoutes, teacherPdfDownloadRoutes };
