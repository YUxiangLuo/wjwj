import { and, eq, exists, isNull } from "drizzle-orm";
import { db } from "../../db";
import { task, topic } from "../../db/schema";

export async function requireTopicOwner(topicId: number, teacherId: number) {
    const assignedTask = db
        .select({ id: task.id })
        .from(task)
        .where(eq(task.topicId, topic.id));
    const [row] = await db
        .select({
            id: topic.id,
            status: topic.status,
            excelFilePath: topic.excelFilePath,
            hasTasks: exists(assignedTask),
        })
        .from(topic)
        .where(and(eq(topic.id, topicId), eq(topic.teacherId, teacherId), isNull(topic.deletedAt)));

    return row ?? null;
}
