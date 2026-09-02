import { and, asc, count, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, student, task, topic } from "../../db/schema";
import { json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
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

        const activeTaskRows = await db.select({
            id: task.id,
            className: class_.name,
            topicName: topic.name,
            deadline: task.deadline,
            total: count(student.id),
            completed: sql<number>`count(${experiment.id}) filter (where ${experiment.status} in ('submitted', 'graded'))::integer`,
            pending: sql<number>`count(${experiment.id}) filter (where ${experiment.status} = 'submitted')::integer`,
            rejected: sql<number>`count(${experiment.id}) filter (where ${experiment.status} = 'rejected')::integer`,
        })
            .from(task)
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .leftJoin(student, and(eq(student.classId, class_.id), isNull(student.deletedAt)))
            .leftJoin(experiment, and(eq(experiment.studentId, student.id), eq(experiment.taskId, task.id)))
            .where(and(
                ...teacherScope,
                eq(topic.status, 1),
                or(isNull(task.openTime), lte(task.openTime, now)),
                or(isNull(task.deadline), gt(task.deadline, now)),
            ))
            .groupBy(task.id, topic.id, class_.id)
            .orderBy(asc(task.deadline), desc(task.createdAt))
            .limit(6);

        return json({
            stats: [
                { label: "我的班级", value: Number(myClasses?.count ?? 0) },
                { label: "我的实验模板", value: Number(myTopics?.count ?? 0) },
                { label: "待批改作业", value: Number(pendingGrading?.count ?? 0) },
                { label: "进行中实验任务", value: Number(activeTasks?.count ?? 0) },
            ],
            activeTasks: activeTaskRows.map((row) => ({
                id: row.id,
                className: row.className,
                templateName: row.topicName,
                deadline: row.deadline?.toISOString() ?? null,
                total: Number(row.total ?? 0),
                completed: Number(row.completed ?? 0),
                pending: Number(row.pending ?? 0),
                rejected: Number(row.rejected ?? 0),
            })),
        });
    },
};

export { dashboardRoutes };
