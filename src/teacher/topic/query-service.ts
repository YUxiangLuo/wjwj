import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, student, submission, task, topic, topicAttachment, topicRecommendQuestion } from "../../db/schema";
import { parseExcelFile } from "./file-utils";
import { buildTaskProgressSnapshot } from "./task-progress";

export async function listTeacherTopics(teacherId: number) {
    return db
        .select({
            id: topic.id,
            name: topic.name,
            description: topic.description,
            status: topic.status,
            dataRows: topic.excelRowCount,
            createdAt: topic.createdAt,
        })
        .from(topic)
        .where(and(eq(topic.teacherId, teacherId), eq(topic.isDeleted, 0)))
        .orderBy(desc(topic.createdAt));
}

export async function getTeacherTopicDetail(topicId: number) {
    const [topicInfo] = await db.select().from(topic).where(eq(topic.id, topicId));
    const attachments = await db
        .select()
        .from(topicAttachment)
        .where(eq(topicAttachment.topicId, topicId))
        .orderBy(desc(topicAttachment.createdAt));
    const recommendQuestions = await db
        .select()
        .from(topicRecommendQuestion)
        .where(eq(topicRecommendQuestion.topicId, topicId))
        .orderBy(asc(topicRecommendQuestion.sortOrder));

    let excelInfo = null as null | { columns: string[]; preview: any[] };
    if (topicInfo?.excelFilePath) {
        try {
            const buffer = await Bun.file(`${process.cwd()}${topicInfo.excelFilePath}`).arrayBuffer();
            const parsed = await parseExcelFile(buffer);
            excelInfo = { columns: parsed.columns, preview: parsed.preview };
        } catch {
            excelInfo = null;
        }
    }

    return { topic: topicInfo ?? null, attachments, recommendQuestions, excelInfo };
}

export async function listTeacherTasks(teacherId: number) {
    return db
        .select({
            id: task.id,
            topic: topic.name,
            className: class_.name,
            publishedAt: task.openTime,
            deadline: task.deadline,
            total: count(student.id),
            completed: sql<number>`(
                SELECT COUNT(*)
                FROM submission s
                INNER JOIN experiment e ON s.experiment_id = e.id
                INNER JOIN student st ON e.student_id = st.id AND st.deleted_at IS NULL
                WHERE e.task_id = ${task.id} AND s.status IN (1, 2, 3)
            )`,
            pending: sql<number>`(
                SELECT COUNT(*)
                FROM submission s
                INNER JOIN experiment e ON s.experiment_id = e.id
                INNER JOIN student st ON e.student_id = st.id AND st.deleted_at IS NULL
                WHERE e.task_id = ${task.id} AND s.status = 1
            )`,
        })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .leftJoin(student, and(eq(student.classId, class_.id), isNull(student.deletedAt)))
        .where(and(eq(class_.teacherId, teacherId), isNull(task.deletedAt)))
        .groupBy(task.id)
        .orderBy(desc(task.createdAt));
}

export async function getTeacherTaskProgress(taskId: number, teacherId: number) {
    const [taskRow] = await db
        .select({
            id: task.id,
            topicName: topic.name,
            className: class_.name,
            classId: task.classId,
            deadline: task.deadline,
        })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(and(eq(task.id, taskId), eq(class_.teacherId, teacherId)));

    if (!taskRow) {
        return null;
    }

    const students = await db
        .select({
            id: student.id,
            studentId: student.studentId,
            name: student.name,
            experimentId: experiment.id,
            currentStage: experiment.currentStage,
            experimentStatus: experiment.status,
            latestSubmission: sql<string | null>`(
                SELECT CONCAT(s.id, ',', s.status)
                FROM submission s
                WHERE s.experiment_id = ${experiment.id}
                ORDER BY s.submitted_at DESC, s.id DESC
                LIMIT 1
            )`,
            lastActivity: experiment.updatedAt,
        })
        .from(student)
        .leftJoin(experiment, and(eq(experiment.studentId, student.id), eq(experiment.taskId, taskId)))
        .where(and(eq(student.classId, taskRow.classId), isNull(student.deletedAt)))
        .orderBy(asc(student.studentId));

    const snapshot = buildTaskProgressSnapshot(students);

    return {
        task: { topicName: taskRow.topicName, className: taskRow.className, deadline: taskRow.deadline },
        counts: snapshot.counts,
        students: snapshot.students,
    };
}
