import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, student, submission, task, topic } from "../../db/schema";
import { error, json } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { getCurrentTeacherId } from "./auth";

const dashboardRoutes: RouteDefinition = {
    async GET(req) {
        const currentTeacherId = await getCurrentTeacherId(req);
        if (!currentTeacherId) return error("未登录或登录已过期", "UNAUTHORIZED", 401);

        const [[myClasses], [myTopics], [pendingGrading], [activeTasks]] = await Promise.all([
            db.select({ count: count() }).from(class_).where(eq(class_.teacherId, currentTeacherId)),
            db.select({ count: count() }).from(topic).where(eq(topic.teacherId, currentTeacherId)),
            db.select({ count: count() })
                .from(submission)
                .innerJoin(experiment, eq(submission.experimentId, experiment.id))
                .innerJoin(task, eq(experiment.taskId, task.id))
                .innerJoin(class_, eq(task.classId, class_.id))
                .where(and(eq(submission.status, 1), eq(class_.teacherId, currentTeacherId))),
            db.select({ count: count() }).from(task).innerJoin(class_, eq(task.classId, class_.id)).where(eq(class_.teacherId, currentTeacherId)),
        ]);

        const recentSubs = await db
            .select({
                studentName: student.name,
                className: class_.name,
                topicName: topic.name,
                submittedAt: submission.submittedAt,
            })
            .from(submission)
            .innerJoin(experiment, eq(submission.experimentId, experiment.id))
            .innerJoin(student, eq(experiment.studentId, student.id))
            .innerJoin(task, eq(experiment.taskId, task.id))
            .innerJoin(topic, eq(task.topicId, topic.id))
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(eq(class_.teacherId, currentTeacherId))
            .orderBy(desc(submission.submittedAt))
            .limit(5);

        return json({
            stats: [
                { label: "我的班级", value: myClasses?.count ?? 0 },
                { label: "我的课题", value: myTopics?.count ?? 0 },
                { label: "待批改作业", value: pendingGrading?.count ?? 0 },
                { label: "进行中任务", value: activeTasks?.count ?? 0 },
            ],
            recentSubmissions: recentSubs.map((sub) => ({
                student: sub.studentName,
                class: sub.className,
                topic: sub.topicName,
                time: sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "未知时间",
            })),
        });
    },
};

export { dashboardRoutes };
