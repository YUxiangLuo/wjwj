import { and, asc, count, desc, eq, exists, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, student, task, topic, topicAttachment } from "../../db/schema";
import { normalizeRecommendQuestionsFromDb } from "../../lib/questionnaire-normalize";
import { resolveStoragePath } from "../../server/storage-files";
import { parseExcelFile } from "./file-utils";
import { buildTaskProgressSnapshot } from "./task-progress";
import { parseTopicFieldMapping } from "@/domain/statistics/population";

export async function listTeacherTopics(teacherId: number) {
    const assignedTask = db
        .select({ id: task.id })
        .from(task)
        .where(eq(task.topicId, topic.id));

    return db
        .select({
            id: topic.id,
            name: topic.name,
            description: topic.description,
            status: topic.status,
            dataRows: topic.excelRowCount,
            hasTasks: exists(assignedTask),
            createdAt: topic.createdAt,
        })
        .from(topic)
        .where(eq(topic.teacherId, teacherId))
        .orderBy(desc(topic.createdAt));
}

export async function getTeacherTopicDetail(topicId: number) {
    const [topicInfo] = await db.select().from(topic).where(eq(topic.id, topicId));
    const attachments = await db
        .select({
            id: topicAttachment.id,
            topicId: topicAttachment.topicId,
            fileName: topicAttachment.fileName,
            fileType: topicAttachment.fileType,
            fileSize: topicAttachment.fileSize,
            createdAt: topicAttachment.createdAt,
        })
        .from(topicAttachment)
        .where(eq(topicAttachment.topicId, topicId))
        .orderBy(desc(topicAttachment.createdAt));
    const recommendQuestions = topicInfo?.recommendQuestions != null
        ? normalizeRecommendQuestionsFromDb(topicInfo.recommendQuestions)
        : [];

    let excelInfo = null as null | { columns: string[]; preview: any[]; columnValues: Record<string, string[]>; columnValuesTruncated: string[] };
    if (topicInfo?.excelFilePath) {
        try {
            const buffer = await Bun.file(resolveStoragePath(topicInfo.excelFilePath)).arrayBuffer();
            const parsed = await parseExcelFile(buffer, topicInfo.excelFilePath, {
                numericFields: parseTopicFieldMapping(topicInfo.fieldMapping)?.numeric ?? [],
            });
            excelInfo = { columns: parsed.columns, preview: parsed.preview, columnValues: parsed.columnValues, columnValuesTruncated: parsed.columnValuesTruncated };
        } catch {
            excelInfo = null;
        }
    }

    const publicTopic = topicInfo ? (() => {
        const {
            teacherId: _teacherId,
            excelFilePath: _excelFilePath,
            ...safeTopic
        } = topicInfo;
        return safeTopic;
    })() : null;

    return {
        topic: publicTopic,
        hasExcelFile: Boolean(topicInfo?.excelFilePath),
        attachments,
        recommendQuestions,
        excelInfo,
    };
}

export async function listTeacherTasks(teacherId: number) {
    return db
        .select({
            id: task.id,
            topicId: task.topicId,
            classId: task.classId,
            topic: topic.name,
            className: class_.name,
            publishedAt: task.openTime,
            deadline: task.deadline,
            total: count(student.id),
            completed: sql<number>`count(${experiment.id}) filter (where ${experiment.status} in ('submitted', 'graded'))::integer`,
            pending: sql<number>`count(${experiment.id}) filter (where ${experiment.status} = 'submitted')::integer`,
        })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .leftJoin(student, eq(student.classId, class_.id))
        .leftJoin(experiment, and(eq(experiment.studentId, student.id), eq(experiment.taskId, task.id)))
        .where(eq(class_.teacherId, teacherId))
        .groupBy(task.id, topic.id, class_.id)
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
            lastActivity: experiment.updatedAt,
        })
        .from(student)
        .leftJoin(experiment, and(eq(experiment.studentId, student.id), eq(experiment.taskId, taskId)))
        .where(eq(student.classId, taskRow.classId))
        .orderBy(asc(student.studentId));

    const snapshot = buildTaskProgressSnapshot(students);

    return {
        task: { topicName: taskRow.topicName, className: taskRow.className, deadline: taskRow.deadline },
        counts: snapshot.counts,
        students: snapshot.students,
    };
}
