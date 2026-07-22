import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, student, task, teacher, topic } from "../../db/schema";
import { validateObservedVersion } from "../../lib/observed-version";
import { scoringWeightsFrom } from "../../lib/scoring-weights";
import { error, getRouteParam, getSearchParams, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { normalizeSamplePlanData } from "../../student/experiment/sample-plan-display";
import { parseStoredJson } from "../../student/experiment/serialization";
import { getTeacherUser } from "./auth";

function escapeLike(value: string) {
    return value.replace(/[%_\\]/g, (character) => `\\${character}`);
}

function numeric(value: string | null) {
    return value == null ? null : Number(value);
}

function snapshotTextField(field: "studentName" | "topicName") {
    return sql<string>`CASE
        WHEN jsonb_typeof(${experiment.submissionSnapshot}) = 'string'
            THEN ((${experiment.submissionSnapshot} #>> '{}')::jsonb ->> ${field})
        ELSE (${experiment.submissionSnapshot} ->> ${field})
    END`;
}

function baseConditions(teacherId: number) {
    return [
        eq(class_.teacherId, teacherId),
        isNull(student.deletedAt),
        isNull(task.deletedAt),
        isNull(topic.deletedAt),
        inArray(experiment.status, ["submitted", "graded", "rejected"]),
    ];
}

const gradingRoutes: RouteDefinition = {
    async GET(req) {
        const current = getTeacherUser(req);
        const params = getSearchParams(req);
        const page = Math.max(1, Number(params.get("page")) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize")) || 20));
        const conditions = baseConditions(current.id);
        const status = params.get("status");
        if (status === "pending") conditions.push(eq(experiment.status, "submitted"));
        if (status === "graded") conditions.push(eq(experiment.status, "graded"));
        if (status === "rejected") conditions.push(eq(experiment.status, "rejected"));
        const className = params.get("className");
        const topicName = params.get("topicName");
        if (className) conditions.push(eq(class_.name, className));
        if (topicName) conditions.push(eq(topic.name, topicName));
        const keyword = params.get("keyword")?.trim();
        if (keyword) {
            const value = `%${escapeLike(keyword)}%`;
            conditions.push(or(
                ilike(student.name, value),
                ilike(student.studentId, value),
                ilike(topic.name, value),
                ilike(snapshotTextField("studentName"), value),
                ilike(snapshotTextField("topicName"), value),
            )!);
        }
        const where = and(...conditions);
        const [[totalRow], rows] = await Promise.all([
            db.select({ count: count() })
                .from(experiment)
                .innerJoin(student, eq(experiment.studentId, student.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .innerJoin(topic, eq(task.topicId, topic.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .where(where),
            db.select({
                id: experiment.id,
                studentName: student.name,
                studentId: student.studentId,
                topic: topic.name,
                className: class_.name,
                submittedAt: experiment.submittedAt,
                status: experiment.status,
                score: experiment.totalScore,
                gradedByName: teacher.name,
                gradedAt: experiment.gradedAt,
                submissionSnapshot: experiment.submissionSnapshot,
            })
                .from(experiment)
                .innerJoin(student, eq(experiment.studentId, student.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .innerJoin(topic, eq(task.topicId, topic.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .leftJoin(teacher, eq(experiment.gradedByTeacherId, teacher.id))
                .where(where)
                .orderBy(desc(experiment.submittedAt))
                .limit(pageSize)
                .offset((page - 1) * pageSize),
        ]);
        return json({
            items: rows.map((row) => {
                const snapshot = parseStoredJson<{ studentName?: string; topicName?: string }>(row.submissionSnapshot);
                const { submissionSnapshot: _, ...item } = row;
                return {
                    ...item,
                    studentName: snapshot?.studentName ?? row.studentName,
                    topic: snapshot?.topicName ?? row.topic,
                    score: numeric(row.score),
                };
            }),
            total: Number(totalRow?.count ?? 0),
            page,
            pageSize,
        });
    },
};

async function findOwnedExperiment(experimentId: number, teacherId: number) {
    const [row] = await db.select({
        id: experiment.id,
        version: experiment.version,
        studentName: student.name,
        studentId: student.studentId,
        className: class_.name,
        topic: topic.name,
        topicName: topic.name,
        topicDesc: topic.description,
        populationSize: topic.excelRowCount,
        weightConfig: topic.weightConfig,
        status: experiment.status,
        submittedAt: experiment.submittedAt,
        submissionSnapshot: experiment.submissionSnapshot,
        reportContent: experiment.reportContent,
        samplePlan: experiment.samplePlan,
        questionnaire: experiment.questionnaire,
        samplingResults: experiment.samplingResults,
        scoreQuestionnaire: experiment.scoreQuestionnaire,
        scoreProcess: experiment.scoreProcess,
        scoreReport: experiment.scoreReport,
        totalScore: experiment.totalScore,
        teacherComment: experiment.teacherComment,
        rejectReason: experiment.rejectReason,
        gradedAt: experiment.gradedAt,
        gradedByName: teacher.name,
    })
        .from(experiment)
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .leftJoin(teacher, eq(experiment.gradedByTeacherId, teacher.id))
        .where(and(eq(experiment.id, experimentId), ...baseConditions(teacherId)));
    return row ?? null;
}

const gradingDetailRoutes: RouteDefinition = {
    async GET(req) {
        const current = getTeacherUser(req);
        const experimentId = Number(getRouteParam(req, "id"));
        if (!Number.isInteger(experimentId) || experimentId <= 0) return error("无效的实验ID", "INVALID_ID");
        const row = await findOwnedExperiment(experimentId, current.id);
        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);
        const snapshot = parseStoredJson<{
            studentName?: string;
            topicName?: string;
            populationSize?: number | null;
            questionnaire?: unknown;
            samplePlan?: unknown;
            samplingResults?: unknown;
            reportContent?: string;
            weightConfig?: unknown;
        }>(row.submissionSnapshot);
        const populationSize = snapshot?.populationSize ?? row.populationSize;
        const weights = scoringWeightsFrom(snapshot?.weightConfig ?? row.weightConfig);
        return json({
            ...row,
            studentName: snapshot?.studentName ?? row.studentName,
            topic: snapshot?.topicName ?? row.topic,
            topicName: snapshot?.topicName ?? row.topicName,
            populationSize,
            questionnaire: snapshot?.questionnaire ?? parseStoredJson(row.questionnaire),
            samplePlan: normalizeSamplePlanData(
                snapshot?.samplePlan ?? parseStoredJson(row.samplePlan),
                populationSize,
            ),
            samplingResults: snapshot?.samplingResults ?? parseStoredJson(row.samplingResults),
            reportContent: snapshot?.reportContent ?? row.reportContent ?? "",
            scoreQuestionnaire: numeric(row.scoreQuestionnaire),
            scoreProcess: numeric(row.scoreProcess),
            scoreReport: numeric(row.scoreReport),
            totalScore: numeric(row.totalScore),
            weights,
        });
    },

    async POST(req) {
        const current = getTeacherUser(req);
        const experimentId = Number(getRouteParam(req, "id"));
        if (!Number.isInteger(experimentId) || experimentId <= 0) return error("无效的实验ID", "INVALID_ID");
        const row = await findOwnedExperiment(experimentId, current.id);
        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);
        const body = await parseBody<{
            observedVersion?: unknown;
            scoreQuestionnaire?: number;
            scoreProcess?: number;
            scoreReport?: number;
            comment?: string;
        }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, row.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);
        if (row.status !== "submitted" && row.status !== "graded") {
            return error("当前状态不能评分", "INVALID_STATUS", 409);
        }
        const scores = [body.scoreQuestionnaire, body.scoreProcess, body.scoreReport];
        if (scores.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100)) {
            return error("分项分数需在 0-100 之间", "VALIDATION_ERROR", 400);
        }
        const comment = body.comment?.trim() ?? "";
        if (comment.length > 2_000) return error("教师评语不能超过2000字", "VALIDATION_ERROR", 400);
        const snapshot = parseStoredJson<{ weightConfig?: unknown }>(row.submissionSnapshot);
        const weights = scoringWeightsFrom(snapshot?.weightConfig ?? row.weightConfig);
        const total = (
            body.scoreQuestionnaire! * weights.questionnaire
            + body.scoreProcess! * weights.process
            + body.scoreReport! * weights.report
        ) / 100;
        const now = new Date();
        const updated = await db.update(experiment).set({
            status: "graded",
            version: versionResult.value + 1,
            scoreQuestionnaire: String(body.scoreQuestionnaire),
            scoreProcess: String(body.scoreProcess),
            scoreReport: String(body.scoreReport),
            totalScore: total.toFixed(2),
            teacherComment: comment || null,
            rejectReason: null,
            gradedByTeacherId: current.id,
            gradedAt: now,
            updatedAt: now,
        }).where(and(
            eq(experiment.id, experimentId),
            eq(experiment.version, versionResult.value),
            eq(experiment.status, row.status),
        )).returning({ id: experiment.id });
        if (!updated.length) return error("提交记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        return json({ success: true, totalScore: Number(total.toFixed(2)) });
    },
};

const gradingRejectRoutes: RouteDefinition = {
    async POST(req) {
        const current = getTeacherUser(req);
        const experimentId = Number(getRouteParam(req, "id"));
        if (!Number.isInteger(experimentId) || experimentId <= 0) return error("无效的实验ID", "INVALID_ID");
        const row = await findOwnedExperiment(experimentId, current.id);
        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);
        const body = await parseBody<{ observedVersion?: unknown; reason?: string }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, row.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);
        if (row.status !== "submitted") return error("只有待批改实验可以驳回", "INVALID_STATUS", 409);
        const reason = body.reason?.trim() ?? "";
        if (reason.length < 5 || reason.length > 1_000) {
            return error("驳回理由长度需在5-1000字之间", "VALIDATION_ERROR", 400);
        }
        const now = new Date();
        const updated = await db.update(experiment).set({
            status: "rejected",
            version: versionResult.value + 1,
            rejectReason: reason,
            scoreQuestionnaire: null,
            scoreProcess: null,
            scoreReport: null,
            totalScore: null,
            teacherComment: null,
            gradedByTeacherId: current.id,
            gradedAt: now,
            updatedAt: now,
        }).where(and(
            eq(experiment.id, experimentId),
            eq(experiment.version, versionResult.value),
            eq(experiment.status, row.status),
        )).returning({ id: experiment.id });
        if (!updated.length) return error("提交记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        return json({ success: true });
    },
};

export { gradingDetailRoutes, gradingRejectRoutes, gradingRoutes };
