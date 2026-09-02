import { and, count, eq, inArray, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "../../db";
import { class_, experiment, semester, student, task, teacher, topic } from "../../db/schema";
import { error, getSearchParams, json, parsePositiveInteger } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { parseStoredJson } from "../../student/experiment/serialization";
import { formatDateStampCN, formatDateTimeCN } from "../../utils/format";
import { getPrimaryTeacherIdOrThrow } from "./auth";

function parseIdList(value: string | null) {
    if (!value) return [];
    const parsed = value.split(",").map((item) => parsePositiveInteger(item.trim()));
    return parsed.some((item) => item === null) ? null : parsed as number[];
}

function parseOptionalId(value: string | null) {
    if (!value || value === "all") return null;
    return parsePositiveInteger(value) ?? Number.NaN;
}

function statusLabel(status: typeof experiment.$inferSelect.status) {
    if (status === "graded") return "已批改";
    if (status === "rejected") return "已驳回";
    return "待批改";
}

function nullableNumber(value: unknown) {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function getGradeExportRows(teacherId: number, params: URLSearchParams) {
    const classId = parseOptionalId(params.get("classId"));
    const topicId = parseOptionalId(params.get("topicId"));
    const taskId = parseOptionalId(params.get("taskId"));
    if ([classId, topicId, taskId].some(Number.isNaN)) return null;
    const conditions = [
        eq(class_.teacherId, teacherId),
        eq(student.classId, task.classId),
        inArray(experiment.status, ["submitted", "graded", "rejected"]),
    ];
    const semesterName = params.get("semester");
    if (semesterName && semesterName !== "all") conditions.push(eq(semester.name, semesterName));
    if (classId != null) conditions.push(eq(class_.id, classId));
    if (topicId != null) conditions.push(eq(topic.id, topicId));
    if (taskId != null) conditions.push(eq(task.id, taskId));
    const taskIds = parseIdList(params.get("taskIds"));
    if (taskIds === null) return null;
    if (taskIds.length) conditions.push(inArray(task.id, taskIds));

    const rows = await db.select({
        studentId: student.studentId,
        studentName: student.name,
        className: class_.name,
        topicName: topic.name,
        submittedAt: experiment.submittedAt,
        scoreQuestionnaire: experiment.scoreQuestionnaire,
        scoreProcess: experiment.scoreProcess,
        scoreReport: experiment.scoreReport,
        totalScore: experiment.totalScore,
        status: experiment.status,
        gradedByName: teacher.name,
        gradedAt: experiment.gradedAt,
        submissionSnapshot: experiment.submissionSnapshot,
    })
        .from(experiment)
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .innerJoin(semester, eq(class_.semesterId, semester.id))
        .leftJoin(teacher, eq(experiment.gradedByTeacherId, teacher.id))
        .where(and(...conditions));
    return rows.map((row) => {
        const snapshot = parseStoredJson<{ studentName?: string; topicName?: string }>(row.submissionSnapshot);
        return {
        studentId: row.studentId,
        name: snapshot?.studentName ?? row.studentName,
        className: row.className,
        topicName: snapshot?.topicName ?? row.topicName,
        submittedAt: row.submittedAt ? formatDateTimeCN(row.submittedAt) : "",
        scoreQuestionnaire: row.scoreQuestionnaire ?? "",
        scoreProcess: row.scoreProcess ?? "",
        scoreReport: row.scoreReport ?? "",
        totalScore: row.totalScore ?? "",
        status: statusLabel(row.status),
        gradedAt: row.gradedAt ? formatDateTimeCN(row.gradedAt) : "",
        gradedBy: row.gradedByName ?? "",
        };
    });
}

const gradeExportPreviewRoutes: RouteDefinition = {
    async GET(req) {
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const params = getSearchParams(req);
        const classId = parseOptionalId(params.get("classId"));
        const topicId = parseOptionalId(params.get("topicId"));
        if ([classId, topicId].some(Number.isNaN)) return error("查询参数无效", "INVALID_PARAM", 400);
        const conditions = [eq(class_.teacherId, teacherId)];
        const semesterName = params.get("semester");
        if (semesterName && semesterName !== "all") conditions.push(eq(semester.name, semesterName));
        if (classId != null) conditions.push(eq(class_.id, classId));
        if (topicId != null) conditions.push(eq(topic.id, topicId));

        const rows = await db.select({
            taskId: task.id,
            topicId: topic.id,
            topicName: topic.name,
            classId: class_.id,
            className: class_.name,
            total: count(student.id),
            graded: sql<number>`(
                SELECT COUNT(*)::integer FROM experiment e
                INNER JOIN student counted_student ON counted_student.id = e.student_id
                WHERE e.task_id = ${task.id}
                  AND e.status = 'graded'
                  AND counted_student.class_id = ${task.classId}
            )`,
            avgScore: sql<number>`(
                SELECT COALESCE(AVG(e.total_score), 0)::double precision FROM experiment e
                INNER JOIN student counted_student ON counted_student.id = e.student_id
                WHERE e.task_id = ${task.id}
                  AND e.status = 'graded'
                  AND counted_student.class_id = ${task.classId}
            )`,
        })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .innerJoin(semester, eq(class_.semesterId, semester.id))
            .leftJoin(student, eq(student.classId, class_.id))
            .where(and(...conditions))
            .groupBy(task.id, topic.id, class_.id);
        return json(rows.map((row) => ({
            taskId: row.taskId,
            topicId: row.topicId,
            topic: row.topicName,
            classId: row.classId,
            className: row.className,
            graded: Number(row.graded ?? 0),
            total: Number(row.total ?? 0),
            avgScore: Number(row.avgScore ?? 0),
        })));
    },
};

const gradeExportDataRoutes: RouteDefinition = {
    async GET(req) {
        const rows = await getGradeExportRows(getPrimaryTeacherIdOrThrow(req), getSearchParams(req));
        return rows ? json(rows) : error("查询参数无效", "INVALID_PARAM", 400);
    },
};

const gradeAnalyticsRoutes: RouteDefinition = {
    async GET(req) {
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const params = getSearchParams(req);
        const classId = parseOptionalId(params.get("classId"));
        const topicId = parseOptionalId(params.get("topicId"));
        if ([classId, topicId].some(Number.isNaN)) return error("查询参数无效", "INVALID_PARAM", 400);

        const conditions = [eq(class_.teacherId, teacherId)];
        const semesterName = params.get("semester");
        if (semesterName && semesterName !== "all") conditions.push(eq(semester.name, semesterName));
        if (classId != null) conditions.push(eq(class_.id, classId));
        if (topicId != null) conditions.push(eq(topic.id, topicId));

        const [statusRows, [scoreRow]] = await Promise.all([
            db.select({ status: experiment.status, count: count(student.id) })
                .from(task)
                .innerJoin(topic, eq(task.topicId, topic.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .innerJoin(semester, eq(class_.semesterId, semester.id))
                .leftJoin(student, eq(student.classId, class_.id))
                .leftJoin(experiment, and(eq(experiment.studentId, student.id), eq(experiment.taskId, task.id)))
                .where(and(...conditions))
                .groupBy(experiment.status),
            db.select({
                count: count(experiment.totalScore),
                average: sql<number | null>`avg(${experiment.totalScore})::double precision`,
                median: sql<number | null>`percentile_cont(0.5) within group (order by ${experiment.totalScore})::double precision`,
                questionnaireAverage: sql<number | null>`avg(${experiment.scoreQuestionnaire})::double precision`,
                processAverage: sql<number | null>`avg(${experiment.scoreProcess})::double precision`,
                reportAverage: sql<number | null>`avg(${experiment.scoreReport})::double precision`,
                below60: sql<number>`count(*) filter (where ${experiment.totalScore} < 60)::integer`,
                from60To69: sql<number>`count(*) filter (where ${experiment.totalScore} >= 60 and ${experiment.totalScore} < 70)::integer`,
                from70To79: sql<number>`count(*) filter (where ${experiment.totalScore} >= 70 and ${experiment.totalScore} < 80)::integer`,
                from80To89: sql<number>`count(*) filter (where ${experiment.totalScore} >= 80 and ${experiment.totalScore} < 90)::integer`,
                from90To100: sql<number>`count(*) filter (where ${experiment.totalScore} >= 90 and ${experiment.totalScore} <= 100)::integer`,
            })
                .from(experiment)
                .innerJoin(student, eq(experiment.studentId, student.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .innerJoin(topic, eq(task.topicId, topic.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .innerJoin(semester, eq(class_.semesterId, semester.id))
                .where(and(
                    ...conditions,
                    eq(student.classId, task.classId),
                    eq(experiment.status, "graded"),
                )),
        ]);

        const statusCounts = { notStarted: 0, inProgress: 0, pendingGrading: 0, graded: 0, rejected: 0 };
        for (const row of statusRows) {
            const value = Number(row.count ?? 0);
            if (row.status === null) statusCounts.notStarted += value;
            else if (row.status === "in_progress") statusCounts.inProgress += value;
            else if (row.status === "submitted") statusCounts.pendingGrading += value;
            else if (row.status === "graded") statusCounts.graded += value;
            else if (row.status === "rejected") statusCounts.rejected += value;
        }

        return json({
            funnel: {
                ...statusCounts,
                total: Object.values(statusCounts).reduce((sum, value) => sum + value, 0),
            },
            scores: {
                count: Number(scoreRow?.count ?? 0),
                average: nullableNumber(scoreRow?.average),
                median: nullableNumber(scoreRow?.median),
                componentAverages: {
                    questionnaire: nullableNumber(scoreRow?.questionnaireAverage),
                    process: nullableNumber(scoreRow?.processAverage),
                    report: nullableNumber(scoreRow?.reportAverage),
                },
                bands: [
                    { label: "<60", count: Number(scoreRow?.below60 ?? 0) },
                    { label: "60–69", count: Number(scoreRow?.from60To69 ?? 0) },
                    { label: "70–79", count: Number(scoreRow?.from70To79 ?? 0) },
                    { label: "80–89", count: Number(scoreRow?.from80To89 ?? 0) },
                    { label: "90–100", count: Number(scoreRow?.from90To100 ?? 0) },
                ],
            },
        });
    },
};

const gradeExportExcelRoutes: RouteDefinition = {
    async GET(req) {
        const rows = await getGradeExportRows(getPrimaryTeacherIdOrThrow(req), getSearchParams(req));
        if (!rows) return error("查询参数无效", "INVALID_PARAM", 400);
        const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
            学号: row.studentId,
            姓名: row.name,
            班级: row.className,
            实验模板名称: row.topicName,
            提交时间: row.submittedAt,
            问卷设计得分: row.scoreQuestionnaire,
            实验过程得分: row.scoreProcess,
            实验报告得分: row.scoreReport,
            总分: row.totalScore,
            状态: row.status,
            批改人: row.gradedBy,
            批改时间: row.gradedAt,
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "成绩导出");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        const fileName = `grade-export-${formatDateStampCN()}.xlsx`;
        return new Response(buffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename=${fileName}`,
            },
        });
    },
};

export { gradeAnalyticsRoutes, gradeExportDataRoutes, gradeExportExcelRoutes, gradeExportPreviewRoutes };
