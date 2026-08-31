import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { class_, task, topic } from "../../db/schema";

export async function findStudentTaskTopicInfo(taskId: number, classId: number) {
    const [row] = await db
        .select({ id: task.id, topicId: task.topicId })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(
            and(
                eq(task.id, taskId),
                eq(task.classId, classId),
                isNull(task.deletedAt),
                eq(topic.status, 1),
                isNull(topic.deletedAt)
            )
        );

    return row ?? null;
}

export async function findStudentTaskSchedule(taskId: number, classId: number) {
    const [row] = await db
        .select({ openTime: task.openTime, deadline: task.deadline })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(
            and(
                eq(task.id, taskId),
                eq(task.classId, classId),
                isNull(task.deletedAt),
                eq(topic.status, 1),
                isNull(topic.deletedAt)
            )
        );

    return row ?? null;
}

export async function findStudentTaskPopulationSize(taskId: number, classId: number) {
    const [row] = await db
        .select({ excelRowCount: topic.excelRowCount })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(
            and(
                eq(task.id, taskId),
                eq(task.classId, classId),
                isNull(task.deletedAt),
                eq(topic.status, 1),
                isNull(topic.deletedAt)
            )
        );

    return row?.excelRowCount ?? null;
}

export async function findStudentTaskSamplingInfo(taskId: number, classId: number) {
    const [row] = await db
        .select({
            topicId: task.topicId,
            topicName: topic.name,
            excelFilePath: topic.excelFilePath,
            fieldMapping: topic.fieldMapping,
        })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(
            and(
                eq(task.id, taskId),
                eq(task.classId, classId),
                isNull(task.deletedAt),
                eq(topic.status, 1),
                isNull(topic.deletedAt)
            )
        );

    return row ?? null;
}

export async function findStudentTaskSubmitInfo(taskId: number, classId: number) {
    const [row] = await db
        .select({
            openTime: task.openTime,
            deadline: task.deadline,
            topicName: topic.name,
            populationSize: topic.excelRowCount,
            weightConfig: topic.weightConfig,
            fieldMapping: topic.fieldMapping,
            teacherId: class_.teacherId,
            classId: task.classId,
        })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(
            and(
                eq(task.id, taskId),
                eq(task.classId, classId),
                isNull(task.deletedAt),
                eq(topic.status, 1),
                isNull(topic.deletedAt)
            )
        );

    return row ?? null;
}
