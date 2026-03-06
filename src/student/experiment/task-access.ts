import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { task, topic } from "../../db/schema";
import { error } from "../../server/http";

export async function getStudentTaskAccessError(taskId: number, classId: number): Promise<Response | null> {
    const [activeRow] = await db
        .select({ id: task.id })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(and(eq(task.id, taskId), eq(task.classId, classId), isNull(task.deletedAt), eq(topic.isDeleted, 0)));

    if (activeRow) return null;

    const [deletedRow] = await db
        .select({ id: task.id })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(
            and(
                eq(task.id, taskId),
                eq(task.classId, classId),
                or(isNotNull(task.deletedAt), eq(topic.isDeleted, 1), isNotNull(topic.deletedAt))
            )
        );

    if (deletedRow) {
        return error("课题已删除", "TOPIC_DELETED", 410);
    }

    return error("任务不存在", "NOT_FOUND", 404);
}
