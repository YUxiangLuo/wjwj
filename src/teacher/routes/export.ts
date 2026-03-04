import { and, count, eq, isNull, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { db } from "../../db";
import { class_, experiment, student, submission, task, topic } from "../../db/schema";
import { error, getSearchParams, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getCurrentTeacherId } from "./auth";

function parseIdList(value: string | null) {
    if (!value) return [] as number[];
    return value.split(",").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
}

async function getGradeExportRows(currentTeacherId: number, params: URLSearchParams) {
    const classId = params.get("classId");
    const topicId = params.get("topicId");
    const taskId = params.get("taskId");
    const taskIds = parseIdList(params.get("taskIds"));

    let query = db
        .select({
            studentId: student.studentId,
            studentName: student.name,
            className: class_.name,
            topicName: topic.name,
            submittedAt: submission.submittedAt,
            scoreQuestionnaire: submission.scoreQuestionnaire,
            scoreProcess: submission.scoreProcess,
            scoreReport: submission.scoreReport,
            totalScore: submission.totalScore,
            status: submission.status,
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
        .where(eq(class_.teacherId, currentTeacherId))
        .$dynamic();

    if (classId && classId !== "all") {
        query = query.where(eq(class_.id, Number(classId)));
    }
    if (topicId && topicId !== "all") {
        query = query.where(eq(topic.id, Number(topicId)));
    }
    if (taskId && taskId !== "all") {
        query = query.where(eq(task.id, Number(taskId)));
    }
    if (taskIds.length > 0) {
        query = query.where(sql`${task.id} IN (${sql.join(taskIds, sql`, `)})`);
    }

    const rows = await query;
    return rows.map((r) => ({
        studentId: r.studentId,
        name: r.studentName,
        className: r.className,
        topicName: r.topicName,
        submittedAt: r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "",
        scoreQuestionnaire: r.scoreQuestionnaire ?? "",
        scoreProcess: r.scoreProcess ?? "",
        scoreReport: r.scoreReport ?? "",
        totalScore: r.totalScore ?? "",
        status: r.status === 2 ? "已批改" : r.status === 3 ? "已驳回" : r.status === 1 ? "待批改" : "草稿",
        gradedAt: r.gradedAt ? new Date(r.gradedAt).toLocaleString() : "",
        gradedBy: r.gradedById ? String(r.gradedById) : "",
    }));
}

const gradeExportPreviewRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const params = getSearchParams(req);
        const classId = params.get("classId");
        const topicId = params.get("topicId");

        let query = db
            .select({
                taskId: task.id,
                topicId: topic.id,
                topicName: topic.name,
                classId: class_.id,
                className: class_.name,
                total: count(student.id),
                graded: sql<number>`(
                    SELECT COUNT(*)
                    FROM submission s
                    INNER JOIN experiment e ON s.experiment_id = e.id
                    WHERE e.task_id = ${task.id} AND s.status = 2
                )`,
                avgScore: sql<number>`(
                    SELECT AVG(s.total_score)
                    FROM submission s
                    INNER JOIN experiment e ON s.experiment_id = e.id
                    WHERE e.task_id = ${task.id} AND s.status = 2
                )`,
            })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .leftJoin(student, and(eq(student.classId, class_.id), isNull(student.deletedAt)))
            .where(eq(class_.teacherId, currentTeacherId))
            .groupBy(task.id)
            .$dynamic();

        if (classId && classId !== "all") {
            query = query.where(eq(class_.id, Number(classId)));
        }
        if (topicId && topicId !== "all") {
            query = query.where(eq(topic.id, Number(topicId)));
        }

        const rows = await query;
        return json(rows.map((r) => ({
            taskId: r.taskId,
            topicId: r.topicId,
            topic: r.topicName,
            classId: r.classId,
            className: r.className,
            graded: Number(r.graded ?? 0),
            total: Number(r.total ?? 0),
            avgScore: r.avgScore ? Number(r.avgScore) : 0,
        })));
    }
};

const gradeExportDataRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);
        const params = getSearchParams(req);
        const rows = await getGradeExportRows(currentTeacherId, params);
        return json(rows);
    }
};

const gradeExportExcelRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const params = getSearchParams(req);
        const rows = await getGradeExportRows(currentTeacherId, params);

        const headers = [
            "学号",
            "姓名",
            "班级",
            "课题名称",
            "提交时间",
            "问卷设计得分",
            "实验过程得分",
            "实验报告得分",
            "总分",
            "状态",
            "批改人",
            "批改时间",
        ];

        const data = rows.map((r) => ({
            学号: r.studentId,
            姓名: r.name,
            班级: r.className,
            课题名称: r.topicName,
            提交时间: r.submittedAt,
            问卷设计得分: r.scoreQuestionnaire,
            实验过程得分: r.scoreProcess,
            实验报告得分: r.scoreReport,
            总分: r.totalScore,
            状态: r.status,
            批改人: r.gradedBy,
            批改时间: r.gradedAt,
        }));

        const worksheet = XLSX.utils.json_to_sheet(data, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "成绩导出");

        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
        const fileName = `grade-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

        return new Response(buffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename=${fileName}`,
            },
        });
    }
};

export { gradeExportDataRoutes, gradeExportExcelRoutes, gradeExportPreviewRoutes };
