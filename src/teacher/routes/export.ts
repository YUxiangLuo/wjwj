import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "../../db";
import { class_, experiment, semester, student, task, teacher, topic } from "../../db/schema";
import { error, getSearchParams, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { formatDateStampCN, formatDateTimeCN } from "../../utils/format";
import { getPrimaryTeacherIdOrThrow } from "./auth";

function activeEntityFilters() {
    return [isNull(task.deletedAt), isNull(topic.deletedAt)];
}

function parseIdList(value: string | null) {
    return value?.split(",").map((item) => Number(item.trim())).filter(Number.isFinite) ?? [];
}

function parseOptionalId(value: string | null) {
    if (!value || value === "all") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function statusLabel(status: typeof experiment.$inferSelect.status) {
    if (status === "graded") return "已批改";
    if (status === "rejected") return "已驳回";
    return "待批改";
}

async function getGradeExportRows(teacherId: number, params: URLSearchParams) {
    const classId = parseOptionalId(params.get("classId"));
    const topicId = parseOptionalId(params.get("topicId"));
    const taskId = parseOptionalId(params.get("taskId"));
    if ([classId, topicId, taskId].some(Number.isNaN)) return null;
    const conditions = [
        eq(class_.teacherId, teacherId),
        ...activeEntityFilters(),
        inArray(experiment.status, ["submitted", "graded", "rejected"]),
    ];
    const semesterName = params.get("semester");
    if (semesterName && semesterName !== "all") conditions.push(eq(semester.name, semesterName));
    if (classId != null) conditions.push(eq(class_.id, classId));
    if (topicId != null) conditions.push(eq(topic.id, topicId));
    if (taskId != null) conditions.push(eq(task.id, taskId));
    const taskIds = parseIdList(params.get("taskIds"));
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
    })
        .from(experiment)
        .innerJoin(student, eq(experiment.studentId, student.id))
        .innerJoin(task, eq(experiment.taskId, task.id))
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .innerJoin(semester, eq(class_.semesterId, semester.id))
        .leftJoin(teacher, eq(experiment.gradedByTeacherId, teacher.id))
        .where(and(...conditions));
    return rows.map((row) => ({
        studentId: row.studentId,
        name: row.studentName,
        className: row.className,
        topicName: row.topicName,
        submittedAt: row.submittedAt ? formatDateTimeCN(row.submittedAt) : "",
        scoreQuestionnaire: row.scoreQuestionnaire ?? "",
        scoreProcess: row.scoreProcess ?? "",
        scoreReport: row.scoreReport ?? "",
        totalScore: row.totalScore ?? "",
        status: statusLabel(row.status),
        gradedAt: row.gradedAt ? formatDateTimeCN(row.gradedAt) : "",
        gradedBy: row.gradedByName ?? "",
    }));
}

const gradeExportPreviewRoutes: RouteDefinition = {
    async GET(req) {
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const params = getSearchParams(req);
        const classId = parseOptionalId(params.get("classId"));
        const topicId = parseOptionalId(params.get("topicId"));
        if ([classId, topicId].some(Number.isNaN)) return error("查询参数无效", "INVALID_PARAM", 400);
        const conditions = [eq(class_.teacherId, teacherId), ...activeEntityFilters()];
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
                WHERE e.task_id = ${task.id} AND e.status = 'graded'
            )`,
            avgScore: sql<number>`(
                SELECT COALESCE(AVG(e.total_score), 0)::double precision FROM experiment e
                WHERE e.task_id = ${task.id} AND e.status = 'graded'
            )`,
        })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .innerJoin(semester, eq(class_.semesterId, semester.id))
            .leftJoin(student, and(eq(student.classId, class_.id), isNull(student.deletedAt)))
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

const gradeExportExcelRoutes: RouteDefinition = {
    async GET(req) {
        const rows = await getGradeExportRows(getPrimaryTeacherIdOrThrow(req), getSearchParams(req));
        if (!rows) return error("查询参数无效", "INVALID_PARAM", 400);
        const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
            学号: row.studentId,
            姓名: row.name,
            班级: row.className,
            课题名称: row.topicName,
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

export { gradeExportDataRoutes, gradeExportExcelRoutes, gradeExportPreviewRoutes };
