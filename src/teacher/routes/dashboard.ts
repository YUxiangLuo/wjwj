import { and, count, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, student, task, topic } from "../../db/schema";
import { json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { formatDateTimeCN } from "../../utils/format";
import { getPrimaryTeacherIdOrThrow } from "./auth";

const dashboardRoutes: RouteDefinition = {
    async GET(req) {
        const teacherId = getPrimaryTeacherIdOrThrow(req);
        const now = new Date();
        const teacherScope = [eq(class_.teacherId, teacherId), isNull(task.deletedAt), isNull(topic.deletedAt)];

        const [[myClasses], [myTopics], [pendingGrading], [activeTasks]] = await Promise.all([
            db.select({ count: count() }).from(class_).where(eq(class_.teacherId, teacherId)),
            db.select({ count: count() }).from(topic).where(and(eq(topic.teacherId, teacherId), isNull(topic.deletedAt))),
            db.select({ count: count() })
                .from(experiment)
                .innerJoin(student, eq(experiment.studentId, student.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .innerJoin(topic, eq(task.topicId, topic.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .where(and(...teacherScope, isNull(student.deletedAt), eq(experiment.status, "submitted"))),
            db.select({ count: count() })
                .from(task)
                .innerJoin(topic, eq(task.topicId, topic.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .where(and(
                    ...teacherScope,
                    eq(topic.status, 1),
                    or(isNull(task.openTime), lte(task.openTime, now)),
                    or(isNull(task.deadline), gt(task.deadline, now)),
                )),
        ]);

        const recentSubmissions = await db.select({
            studentName: student.name,
            className: class_.name,
            topicName: topic.name,
            submittedAt: experiment.submittedAt,
        })
            .from(experiment)
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(...teacherScope, isNull(student.deletedAt), inArray(experiment.status, ["submitted", "graded", "rejected"])))
            .orderBy(desc(experiment.submittedAt))
            .limit(5);

        const recentGradings = await db.select({
            studentName: student.name,
            className: class_.name,
            topicName: topic.name,
            totalScore: experiment.totalScore,
            status: experiment.status,
            gradedAt: experiment.gradedAt,
        })
            .from(experiment)
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(...teacherScope, isNull(student.deletedAt), inArray(experiment.status, ["graded", "rejected"])))
            .orderBy(desc(experiment.gradedAt))
            .limit(5);

        return json({
            stats: [
                { label: "我的班级", value: Number(myClasses?.count ?? 0) },
                { label: "我的课题", value: Number(myTopics?.count ?? 0) },
                { label: "待批改作业", value: Number(pendingGrading?.count ?? 0) },
                { label: "进行中任务", value: Number(activeTasks?.count ?? 0) },
            ],
            recentSubmissions: recentSubmissions.map((row) => ({
                student: row.studentName,
                class: row.className,
                topic: row.topicName,
                time: row.submittedAt ? formatDateTimeCN(row.submittedAt) : "未知时间",
            })),
            recentGradings: recentGradings.map((row) => ({
                student: row.studentName,
                class: row.className,
                topic: row.topicName,
                score: row.totalScore,
                rejected: row.status === "rejected",
                time: row.gradedAt ? formatDateTimeCN(row.gradedAt) : "未知时间",
            })),
        });
    },
};

export { dashboardRoutes };
