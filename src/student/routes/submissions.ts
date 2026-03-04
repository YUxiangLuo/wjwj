import { and, desc, eq, sql } from "drizzle-orm";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { db } from "../../db";
import { assistant, experiment, submission, task, teacher, topic } from "../../db/schema";
import { error, getRouteParam, getSearchParams, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { requireAuth } from "./auth";

const submissionsByTaskRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const taskId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!taskId) return error("无效的任务ID", "INVALID_ID");

        const [exp] = await db
            .select({ id: experiment.id })
            .from(experiment)
            .where(and(eq(experiment.studentId, currentStudent.id), eq(experiment.taskId, taskId)));

        if (!exp) return json([]);

        const submissions = await db
            .select({
                id: submission.id,
                submittedAt: submission.submittedAt,
                status: submission.status,
                totalScore: submission.totalScore,
                gradedAt: submission.gradedAt,
                gradedByType: submission.gradedByType,
                gradedById: submission.gradedById,
                rejectReason: submission.rejectReason,
            })
            .from(submission)
            .where(eq(submission.experimentId, exp.id))
            .orderBy(desc(submission.submittedAt));

        const teacherIds = submissions
            .filter((s) => s.gradedByType === 2 && s.gradedById)
            .map((s) => s.gradedById!)
            .filter((id, idx, arr) => arr.indexOf(id) === idx);
        const assistantIds = submissions
            .filter((s) => s.gradedByType === 3 && s.gradedById)
            .map((s) => s.gradedById!)
            .filter((id, idx, arr) => arr.indexOf(id) === idx);

        const teachers =
            teacherIds.length > 0
                ? await db.select({ id: teacher.id, name: teacher.name }).from(teacher).where(sql`${teacher.id} IN (${sql.join(teacherIds, sql`, `)})`)
                : [];
        const assistants =
            assistantIds.length > 0
                ? await db.select({ id: assistant.id, name: assistant.name }).from(assistant).where(sql`${assistant.id} IN (${sql.join(assistantIds, sql`, `)})`)
                : [];

        const teacherMap = new Map(teachers.map((t) => [t.id, t.name]));
        const assistantMap = new Map(assistants.map((a) => [a.id, a.name]));

        return json(
            submissions.map((s) => ({
                id: s.id,
                submittedAt: s.submittedAt?.toISOString() ?? null,
                status: s.status,
                totalScore: s.totalScore ? Number(s.totalScore) : null,
                gradedAt: s.gradedAt?.toISOString() ?? null,
                graderName:
                    s.gradedByType === 2
                        ? (teacherMap.get(s.gradedById ?? 0) ?? null)
                        : s.gradedByType === 3
                            ? (assistantMap.get(s.gradedById ?? 0) ?? null)
                            : null,
                rejectReason: s.rejectReason ?? null,
            }))
        );
    },
};

const submissionDetailRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const submissionId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!submissionId) return error("无效的提交ID", "INVALID_ID");

        const [row] = await db
            .select({
                id: submission.id,
                submittedAt: submission.submittedAt,
                status: submission.status,
                scoreQuestionnaire: submission.scoreQuestionnaire,
                scoreProcess: submission.scoreProcess,
                scoreReport: submission.scoreReport,
                totalScore: submission.totalScore,
                teacherComment: submission.teacherComment,
                rejectReason: submission.rejectReason,
                gradedAt: submission.gradedAt,
                gradedByType: submission.gradedByType,
                gradedById: submission.gradedById,
                questionnairePdfPath: submission.questionnairePdfPath,
                reportPdfPath: submission.reportPdfPath,
                taskId: experiment.taskId,
                topicId: task.topicId,
                topicName: topic.name,
                weightConfig: topic.weightConfig,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .where(and(eq(submission.id, submissionId), eq(experiment.studentId, currentStudent.id)));

        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);

        const weightConfig =
            typeof row.weightConfig === "string"
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

        let graderName: string | null = null;
        if (row.gradedByType === 2 && row.gradedById) {
            const [t] = await db.select({ name: teacher.name }).from(teacher).where(eq(teacher.id, row.gradedById));
            graderName = t?.name ?? null;
        }
        if (row.gradedByType === 3 && row.gradedById) {
            const [a] = await db.select({ name: assistant.name }).from(assistant).where(eq(assistant.id, row.gradedById));
            graderName = a?.name ?? null;
        }

        return json({
            id: row.id,
            taskId: row.taskId,
            topicId: row.topicId,
            topicName: row.topicName,
            submittedAt: row.submittedAt?.toISOString() ?? null,
            status: row.status,
            scoreQuestionnaire: row.scoreQuestionnaire ? Number(row.scoreQuestionnaire) : null,
            scoreProcess: row.scoreProcess ? Number(row.scoreProcess) : null,
            scoreReport: row.scoreReport ? Number(row.scoreReport) : null,
            totalScore: row.totalScore ? Number(row.totalScore) : null,
            teacherComment: row.teacherComment ?? null,
            rejectReason: row.rejectReason ?? null,
            gradedAt: row.gradedAt?.toISOString() ?? null,
            graderName,
            questionnairePdfPath: row.questionnairePdfPath ?? null,
            reportPdfPath: row.reportPdfPath ?? null,
            weights,
        });
    },
};

const submissionDownloadRoutes: RouteDefinition = {
    async GET(req) {
        const auth = await requireAuth(req);
        if (auth.error) return auth.error;
        const currentStudent = auth.student!;

        const submissionId = Number.parseInt(getRouteParam(req, "id") ?? "", 10);
        if (!submissionId) return error("无效的提交ID", "INVALID_ID");

        const type = getSearchParams(req).get("type") ?? "report";

        const [row] = await db
            .select({
                questionnairePdfPath: submission.questionnairePdfPath,
                reportPdfPath: submission.reportPdfPath,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .where(and(eq(submission.id, submissionId), eq(experiment.studentId, currentStudent.id)));

        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);

        const filePath = type === "questionnaire" ? row.questionnairePdfPath : row.reportPdfPath;
        if (!filePath) return error("文件不存在", "NOT_FOUND", 404);

        const baseDir = path.join(process.cwd(), "storage");
        const normalizedPath = path.normalize(filePath).replace(/^([/\\])+/, "");
        const fullPath = path.join(baseDir, normalizedPath);

        if (!fullPath.startsWith(baseDir)) {
            return error("无效的文件路径", "INVALID_PATH", 400);
        }

        try {
            const fileBuffer = await fs.readFile(fullPath);
            return new Response(fileBuffer, {
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(type === "questionnaire" ? "questionnaire.pdf" : "report.pdf")}`,
                },
            });
        } catch {
            return error("文件不存在", "NOT_FOUND", 404);
        }
    },
};

export { submissionDetailRoutes, submissionDownloadRoutes, submissionsByTaskRoutes };
