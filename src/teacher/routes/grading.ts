import { and, count, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { resolve, sep } from "node:path";
import { db } from "../../db";
import { assistant, assistantClass, class_, experiment, student, submission, task, teacher, topic } from "../../db/schema";
import { error, getRouteParam, getSearchParams, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getSubmissionPdfMessage, getSubmissionPdfState } from "../../student/experiment/pdf-status";
import { normalizeSamplePlanData } from "../../student/experiment/sample-plan-display";
import { parseStoredJson } from "../../student/experiment/serialization";
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

/** Escape SQL LIKE wildcard characters to prevent unintended pattern matching */
function escapeLike(value: string): string {
    return value.replace(/[%_\\]/g, (ch) => `\\${ch}`);
}

/** 与成绩导出一致：已删任务、已删课题（含 deleted_at）下的提交不在批改流程中展示 */
function activeTaskTopicConditions() {
    return [isNull(task.deletedAt), eq(topic.isDeleted, 0), isNull(topic.deletedAt)];
}

const gradingRoutes: RouteDefinition = {
    async GET(req) {
        const access = await getAccessibleClassIds(req);
        if (!access) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const { classIds } = access;

        const params = getSearchParams(req);
        const status = params.get("status");
        const className = params.get("className");
        const topicName = params.get("topicName");
        const keyword = params.get("keyword")?.trim();
        const page = Math.max(1, Number(params.get("page")) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize")) || 20));

        if (classIds.length === 0) {
            return json({ items: [], total: 0, page, pageSize });
        }

        const conditions = [
            sql`${class_.id} IN (${sql.join(classIds, sql`, `)})`,
            ...activeTaskTopicConditions(),
        ];

        if (status === "pending") {
            conditions.push(or(eq(submission.status, 0), eq(submission.status, 1))!);
        } else if (status === "graded") {
            conditions.push(eq(submission.status, 2));
        } else if (status === "rejected") {
            conditions.push(eq(submission.status, 3));
        }
        if (className) {
            conditions.push(eq(class_.name, className));
        }
        if (topicName) {
            conditions.push(eq(topic.name, topicName));
        }
        if (keyword) {
            const escaped = escapeLike(keyword);
            conditions.push(
                or(
                    ilike(student.name, `%${escaped}%`),
                    ilike(student.studentId, `%${escaped}%`),
                    ilike(topic.name, `%${escaped}%`)
                )!
            );
        }

        const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions);

        const [[totalRow], rows] = await Promise.all([
            db
                .select({ count: count() })
                .from(submission)
                .innerJoin(experiment, eq(submission.experimentId, experiment.id))
                .innerJoin(student, eq(experiment.studentId, student.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .innerJoin(topic, eq(task.topicId, topic.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .where(whereClause),
            db
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
                .where(whereClause)
                .orderBy(desc(submission.submittedAt))
                .limit(pageSize)
                .offset((page - 1) * pageSize),
        ]);

        const totalRaw = totalRow?.count ?? 0;
        const total = typeof totalRaw === "bigint" ? Number(totalRaw) : Number(totalRaw);

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

        const items = rows.map((row) => ({
            ...row,
            gradedByName:
                row.gradedByType === 2
                    ? (teacherMap.get(row.gradedById ?? 0) ?? "教师")
                    : row.gradedByType === 3
                        ? (assistantMap.get(row.gradedById ?? 0) ?? "助教")
                        : null,
        }));

        return json({ items, total, page, pageSize });
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
                populationSize: topic.excelRowCount,
                weightConfig: topic.weightConfig,
                status: submission.status,
                submittedAt: submission.submittedAt,
                snapshotStudentName: submission.pdfSnapshotStudentName,
                snapshotTopicName: submission.pdfSnapshotTopicName,
                snapshotPopulationSize: submission.pdfSnapshotPopulationSize,
                snapshotQuestionnaire: submission.pdfSnapshotQuestionnaire,
                snapshotSamplingResults: submission.pdfSnapshotSamplingResults,
                snapshotSamplePlan: submission.pdfSnapshotSamplePlan,
                snapshotReportContent: submission.pdfSnapshotReportContent,
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
                pdfStatus: submission.pdfStatus,
                pdfGenerationAttempts: submission.pdfGenerationAttempts,
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
            .where(
                and(
                    eq(submission.id, submissionId),
                    sql`${class_.id} IN (${sql.join(classIds, sql`, `)})`,
                    ...activeTaskTopicConditions()
                )
            );

        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);

        const now = new Date();
        const lockExpired = isLockExpired(row.lockedAt);
        const myUserType = isAssistant ? ASSISTANT_USER_TYPE : TEACHER_USER_TYPE;
        const lockedByOther = row.lockedById && (row.lockedByType !== myUserType || row.lockedById !== userId) && !lockExpired;

        if (!lockedByOther && (row.status === 0 || row.status === 1)) {
            await db.update(submission).set({
                lockedByType: myUserType,
                lockedById: userId,
                lockedAt: now,
            }).where(eq(submission.id, submissionId));
        }

        const weightConfig = typeof row.weightConfig === "string"
            ? (() => {
                try {
                    return JSON.parse(row.weightConfig);
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
            studentName: row.snapshotStudentName ?? row.studentName,
            topic: row.snapshotTopicName ?? row.topicName,
            topicName: row.snapshotTopicName ?? row.topicName,
            reportContent: row.snapshotReportContent ?? row.reportContent ?? "",
            questionnaire: parseStoredJson(row.snapshotQuestionnaire) ?? parseStoredJson(row.questionnaire),
            samplePlan: normalizeSamplePlanData(
                parseStoredJson(row.snapshotSamplePlan) ?? parseStoredJson(row.samplePlan),
                row.snapshotPopulationSize ?? row.populationSize ?? null,
            ),
            samplingResults: parseStoredJson(row.snapshotSamplingResults) ?? parseStoredJson(row.samplingResults),
            populationSize: row.snapshotPopulationSize ?? row.populationSize,
            weights,
            readonly: lockedByOther,
            isAssistant,
            gradedByName,
            pdfStatus: getSubmissionPdfState({
                status: row.pdfStatus,
                questionnairePdfPath: row.questionnairePdfPath,
                reportPdfPath: row.reportPdfPath,
            }),
            pdfStatusMessage: getSubmissionPdfMessage({
                status: row.pdfStatus,
                attempts: row.pdfGenerationAttempts,
                questionnairePdfPath: row.questionnairePdfPath,
                reportPdfPath: row.reportPdfPath,
            }),
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
        }>(req);

        if (body.status !== 2 && body.status !== 3) {
            return error("无效的批改状态", "VALIDATION_ERROR", 400);
        }

        // Validate score ranges before touching the DB
        const scores = [body.scoreQuestionnaire, body.scoreProcess, body.scoreReport];
        if (scores.some((s) => !Number.isFinite(s) || s < 0 || s > 100)) {
            return error("分项分数需在 0-100 之间", "VALIDATION_ERROR", 400);
        }

        if ((body.comment ?? "").length > 2000) {
            return error("教师评语不能超过2000字", "VALIDATION_ERROR", 400);
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
            .where(
                and(
                    eq(submission.id, submissionId),
                    sql`${class_.id} IN (${sql.join(classIds, sql`, `)})`,
                    ...activeTaskTopicConditions()
                )
            );

        if (!detail) return error("提交记录不存在", "NOT_FOUND", 404);

        if (detail.status === 3) {
            return error("已驳回的作业不可修改评分", "REJECTED_NOT_EDITABLE", 403);
        }

        const [topicRow] = await db.select({ weightConfig: topic.weightConfig }).from(topic).where(eq(topic.id, detail.topicId));

        const weightConfig = typeof topicRow?.weightConfig === "string"
            ? (() => {
                try {
                    return JSON.parse(topicRow.weightConfig);
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

        const myUserType = isAssistant ? ASSISTANT_USER_TYPE : TEACHER_USER_TYPE;

        // 已批改：仅允许更新分数与评语（课题下任一教师/助教），不改实验状态、不覆盖驳回信息
        if (detail.status === 2) {
            if (body.status !== 2) {
                return error("已批改作业仅支持更新分数与评语", "VALIDATION_ERROR", 400);
            }

            await db
                .update(submission)
                .set({
                    scoreQuestionnaire: String(body.scoreQuestionnaire),
                    scoreProcess: String(body.scoreProcess),
                    scoreReport: String(body.scoreReport),
                    totalScore: String(Number(totalScore.toFixed(2))),
                    teacherComment: body.comment,
                    gradedAt: new Date(),
                    gradedById: userId,
                    gradedByType: myUserType,
                })
                .where(eq(submission.id, submissionId));

            await notifyStudentById(detail.studentId, {
                type: "GRADE_UPDATED",
                title: "成绩已更新",
                content: `您的「${detail.topicName}」作业得分已更新为 ${Number(totalScore.toFixed(2))} 分，请查看最新教师评语。`,
                relatedType: "task",
                relatedId: detail.topicId,
            });

            return json({ success: true });
        }

        // 待批改（0/1）
        if (body.status === 3) {
            const reason = (body.rejectReason ?? "").trim();
            if (reason.length < 10 || reason.length > 1000) {
                return error("驳回理由长度需在10-1000字之间", "VALIDATION_ERROR", 400);
            }
        }

        const lockExpired = isLockExpired(detail.lockedAt);
        if (detail.lockedById && (detail.lockedByType !== myUserType || detail.lockedById !== userId) && !lockExpired) {
            return error("该作业正在被他人批改", "LOCKED", 423);
        }

        // 乐观锁：仅当提交状态仍为待批改（0/1）时才写入，防止并发覆盖
        try {
            await db.transaction(async (tx) => {
                const updated = await tx
                    .update(submission)
                    .set({
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
                    })
                    .where(and(eq(submission.id, submissionId), or(eq(submission.status, 0), eq(submission.status, 1))))
                    .returning({ id: submission.id });

                if (updated.length === 0) {
                    throw new Error("CONCURRENT_GRADE");
                }

                if (body.status === 2) {
                    await tx.update(experiment).set({ status: 2 }).where(eq(experiment.id, detail.experimentId));
                }
                if (body.status === 3) {
                    await tx.update(experiment).set({ status: 3 }).where(eq(experiment.id, detail.experimentId));
                }
            });
        } catch (e) {
            if (e instanceof Error && e.message === "CONCURRENT_GRADE") {
                return error("该作业已被他人批改，请刷新后重试", "CONCURRENT_GRADE", 409);
            }
            throw e;
        }

        if (body.status === 2) {
            await notifyStudentById(detail.studentId, {
                type: "GRADE_COMPLETED",
                title: "作业已批改",
                content: `您提交的「${detail.topicName}」作业已批改完成，得分：${Number(totalScore.toFixed(2))}分`,
                relatedType: "task",
                relatedId: detail.topicId,
            });
        }
        if (body.status === 3) {
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
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(
                and(
                    eq(submission.id, submissionId),
                    sql`${class_.id} IN (${sql.join(access.classIds, sql`, `)})`,
                    ...activeTaskTopicConditions()
                )
            );

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
