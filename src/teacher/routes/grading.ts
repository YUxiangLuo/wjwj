import { readResearchAppendix } from "../../student/experiment/research-records";
import { codebookDownload } from "../../student/experiment/codebook-service";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, samplingAttempt, student, task, teacher, topic } from "../../db/schema";
import { validateObservedVersion } from "../../lib/observed-version";
import { scoringWeightsFrom } from "../../lib/scoring-weights";
import { error, getPositiveRouteId, getSearchParams, json, parseBody, parsePagination, stringValue } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { normalizeSamplePlanData } from "../../student/experiment/sample-plan-display";
import { readPopulationData } from "../../student/experiment/population-data";
import { previewSamplingResults } from "../../student/experiment/sampling-results-preview";
import {
    buildSamplingResultsCsvExport,
    parseSamplingExportType,
    parseSamplingExportFormat,
} from "../../student/experiment/sampling-results-export";
import {
    hydrateSamplingResults,
    inspectSamplingResultsStorage,
    INVALID_SAMPLING_STORAGE_CODE,
    INVALID_SAMPLING_STORAGE_MESSAGE,
} from "../../student/experiment/sampling-storage";
import { readStoredDocument } from "@/lib/stored-document";
import { getTeacherUser } from "./auth";
import { resolveSamplingPolicy } from "../../lib/sampling-policy";
import { writeAuditEvent } from "../../server/audit-event";

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
        inArray(experiment.status, ["submitted", "graded", "rejected"]),
        eq(student.classId, task.classId),
    ];
}

const gradingRoutes: RouteDefinition = {
    async GET(req) {
        const current = getTeacherUser(req);
        const params = getSearchParams(req);
        const pagination = parsePagination(params);
        if (!pagination) return error("分页参数无效", "INVALID_PARAM", 400);
        const { page, pageSize, offset } = pagination;
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
                .offset(offset),
        ]);
        return json({
            items: rows.map((row) => {
                const snapshot = readStoredDocument<{ studentName?: string; topicName?: string }>(row.submissionSnapshot);
                const {
                    submissionSnapshot: _,
                    ...item
                } = row;
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
        taskId: experiment.taskId,
        version: experiment.version,
        studentName: student.name,
        studentId: student.studentId,
        className: class_.name,
        topic: topic.name,
        topicName: topic.name,
        topicDesc: topic.description,
        populationSize: topic.excelRowCount,
        excelFilePath: topic.excelFilePath,
        weightConfig: topic.weightConfig,
        samplingPolicy: topic.samplingPolicy,
        fieldMapping: topic.fieldMapping,
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

// The experiment version does not change on class transfer. Hold its class
// against reassignment until grading/rejection and its audit event commit.
async function lockGradingClass(tx: Pick<typeof db, "select">, experimentId: number, teacherId: number) {
    const [owned] = await tx.select({ id: class_.id })
        .from(experiment)
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(and(eq(experiment.id, experimentId), ...baseConditions(teacherId)))
        .for("share", { of: class_ });
    return Boolean(owned);
}

const gradingDetailRoutes: RouteDefinition = {
    async GET(req) {
        const current = getTeacherUser(req);
        const experimentId = getPositiveRouteId(req);
        if (!experimentId) return error("无效的实验ID", "INVALID_ID");
        const row = await findOwnedExperiment(experimentId, current.id);
        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);
        const snapshot = readStoredDocument<{
            studentName?: string;
            topicName?: string;
            populationSize?: number | null;
            questionnaire?: unknown;
            variableDictionary?: unknown;
            samplePlan?: unknown;
            samplingResults?: unknown;
            reportContent?: string;
            analysisRuns?: unknown;
            weightConfig?: unknown;
            samplingPolicy?: unknown;
        }>(row.submissionSnapshot);
        const populationSize = snapshot?.populationSize ?? row.populationSize;
        const weights = scoringWeightsFrom(snapshot?.weightConfig ?? row.weightConfig);
        const samplingAttempts = await db
            .select({
                id: samplingAttempt.id,
                method: samplingAttempt.method,
                seed: samplingAttempt.seed,
                sampleCount: samplingAttempt.sampleCount,
                details: samplingAttempt.details,
                createdAt: samplingAttempt.createdAt,
            })
            .from(samplingAttempt)
            .where(eq(samplingAttempt.experimentId, experimentId))
            .orderBy(desc(samplingAttempt.createdAt), desc(samplingAttempt.id))
            .limit(100);
        const storedSamplingResults = snapshot?.samplingResults ?? readStoredDocument(row.samplingResults);
        const inspection = inspectSamplingResultsStorage(storedSamplingResults);
        if (!inspection.ok) return error(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
        let samplingResults: unknown = storedSamplingResults;
        if (inspection.needsPopulation) {
            if (!row.excelFilePath) return error("总体数据为空或读取失败", "READ_FAILED", 500);
            const population = await readPopulationData(row.excelFilePath, row.fieldMapping);
            if (!population.length) return error("总体数据为空或读取失败", "READ_FAILED", 500);
            const hydrated = hydrateSamplingResults(storedSamplingResults, population);
            if (!hydrated.ok) return error(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
            samplingResults = hydrated.value;
        }
        const {
            excelFilePath: _excelFilePath,
            taskId: _taskId,
            submissionSnapshot: _submissionSnapshot,
            weightConfig: _weightConfig,
            samplingPolicy: _samplingPolicy,
            ...publicRow
        } = row;
        return json({
            ...publicRow,
            studentName: snapshot?.studentName ?? row.studentName,
            topic: snapshot?.topicName ?? row.topic,
            topicName: snapshot?.topicName ?? row.topicName,
            populationSize,
            questionnaire: snapshot?.questionnaire ?? readStoredDocument(row.questionnaire),
            // Never attach current metadata retroactively to a historical submission.
            variableDictionary: snapshot?.variableDictionary ?? null,
            samplePlan: normalizeSamplePlanData(
                snapshot?.samplePlan ?? readStoredDocument(row.samplePlan),
                populationSize,
            ),
            samplingResults: previewSamplingResults(samplingResults),
            samplingPolicy: resolveSamplingPolicy(snapshot?.samplingPolicy ?? row.samplingPolicy),
            reportContent: snapshot?.reportContent ?? row.reportContent ?? "",
            analysisRuns: readResearchAppendix(snapshot?.analysisRuns),
            scoreQuestionnaire: numeric(row.scoreQuestionnaire),
            scoreProcess: numeric(row.scoreProcess),
            scoreReport: numeric(row.scoreReport),
            totalScore: numeric(row.totalScore),
            weights,
            samplingAttempts,
        });
    },

    async POST(req) {
        const current = getTeacherUser(req);
        const experimentId = getPositiveRouteId(req);
        if (!experimentId) return error("无效的实验ID", "INVALID_ID");
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
        if (body.comment !== undefined && typeof body.comment !== "string") {
            return error("教师评语格式无效", "VALIDATION_ERROR", 400);
        }
        const comment = stringValue(body.comment).trim();
        if (comment.length > 2_000) return error("教师评语不能超过2000字", "VALIDATION_ERROR", 400);
        const snapshot = readStoredDocument<{ weightConfig?: unknown }>(row.submissionSnapshot);
        const weights = scoringWeightsFrom(snapshot?.weightConfig ?? row.weightConfig);
        const total = (
            body.scoreQuestionnaire! * weights.questionnaire
            + body.scoreProcess! * weights.process
            + body.scoreReport! * weights.report
        ) / 100;
        const now = new Date();
        const updated = await db.transaction(async (tx) => {
            if (!(await lockGradingClass(tx, experimentId, current.id))) return null;
            const rows = await tx.update(experiment).set({
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
            if (rows.length) await writeAuditEvent(tx, {
                actorType: "teacher",
                actorId: current.id,
                action: row.status === "graded" ? "grade.updated" : "grade.created",
                entityType: "experiment",
                entityId: experimentId,
                details: {
                    previousStatus: row.status,
                    version: versionResult.value + 1,
                    scoreQuestionnaire: body.scoreQuestionnaire,
                    scoreProcess: body.scoreProcess,
                    scoreReport: body.scoreReport,
                    totalScore: Number(total.toFixed(2)),
                },
            });
            return rows;
        });
        if (!updated) return error("提交记录不存在", "NOT_FOUND", 404);
        if (!updated.length) return error("提交记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        return json({ success: true, totalScore: Number(total.toFixed(2)) });
    },
};

const gradingSamplingExportRoutes: RouteDefinition = {
    async GET(req) {
        const current = getTeacherUser(req);
        const experimentId = getPositiveRouteId(req);
        if (!experimentId) {
            return error("无效的实验ID", "INVALID_ID");
        }
        const type = parseSamplingExportType(getSearchParams(req).get("type"));
        const format = parseSamplingExportFormat(getSearchParams(req).get("format"));
        if (!type || !format) return error("无效的导出类型", "VALIDATION_ERROR", 400);

        const row = await findOwnedExperiment(experimentId, current.id);
        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);
        if (format === "xlsx") return codebookDownload({ experimentId, taskId: row.taskId, version: row.version, status: row.status,
            submissionSnapshot: row.submissionSnapshot, questionnaire: row.questionnaire, samplingResults: row.samplingResults,
            populationSize: row.populationSize, excelFilePath: row.excelFilePath, fieldMapping: row.fieldMapping, type }, req.signal,
            async () => await findOwnedExperiment(experimentId, current.id) ? null : error("提交记录不存在", "NOT_FOUND", 404));
        const snapshot = readStoredDocument<{ samplingResults?: unknown }>(row.submissionSnapshot);
        const storedSamplingResults = snapshot?.samplingResults ?? readStoredDocument(row.samplingResults);
        if (!storedSamplingResults) return error("暂无抽样结果", "NO_DATA", 404);

        const inspection = inspectSamplingResultsStorage(storedSamplingResults);
        if (!inspection.ok) {
            return error(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
        }
        let samplingResults: unknown = storedSamplingResults;
        if (inspection.needsPopulation) {
            if (!row.excelFilePath) return error("总体数据为空或读取失败", "READ_FAILED", 500);
            const population = await readPopulationData(row.excelFilePath, row.fieldMapping);
            if (!population.length) return error("总体数据为空或读取失败", "READ_FAILED", 500);
            const hydrated = hydrateSamplingResults(storedSamplingResults, population);
            if (!hydrated.ok) {
                return error(INVALID_SAMPLING_STORAGE_MESSAGE, INVALID_SAMPLING_STORAGE_CODE, 500);
            }
            samplingResults = hydrated.value;
        }

        const exported = buildSamplingResultsCsvExport(samplingResults, type);
        if (!exported) return error("暂无可导出的数据", "NO_DATA", 404);
        return new Response(exported.csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exported.filename)}`,
            },
        });
    },
};

const gradingRejectRoutes: RouteDefinition = {
    async POST(req) {
        const current = getTeacherUser(req);
        const experimentId = getPositiveRouteId(req);
        if (!experimentId) return error("无效的实验ID", "INVALID_ID");
        const row = await findOwnedExperiment(experimentId, current.id);
        if (!row) return error("提交记录不存在", "NOT_FOUND", 404);
        const body = await parseBody<{ observedVersion?: unknown; reason?: string }>(req);
        const versionResult = validateObservedVersion(body.observedVersion, row.version);
        if (!versionResult.ok) return error(versionResult.message, versionResult.code, versionResult.status);
        if (row.status !== "submitted") return error("只有待批改实验可以驳回", "INVALID_STATUS", 409);
        const reason = stringValue(body.reason).trim();
        if (reason.length < 5 || reason.length > 1_000) {
            return error("驳回理由长度需在5-1000字之间", "VALIDATION_ERROR", 400);
        }
        const now = new Date();
        const updated = await db.transaction(async (tx) => {
            if (!(await lockGradingClass(tx, experimentId, current.id))) return null;
            const rows = await tx.update(experiment).set({
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
            if (rows.length) await writeAuditEvent(tx, {
                actorType: "teacher",
                actorId: current.id,
                action: "submission.rejected",
                entityType: "experiment",
                entityId: experimentId,
                details: { version: versionResult.value + 1, reason },
            });
            return rows;
        });
        if (!updated) return error("提交记录不存在", "NOT_FOUND", 404);
        if (!updated.length) return error("提交记录已发生变化，请刷新后重试", "VERSION_CONFLICT", 409);
        return json({ success: true });
    },
};

export { gradingDetailRoutes, gradingRejectRoutes, gradingRoutes, gradingSamplingExportRoutes };
