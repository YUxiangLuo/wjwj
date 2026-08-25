import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { task, topic } from "../../db/schema";

export async function requireTopicOwner(topicId: number, teacherId: number) {
    const [row] = await db
        .select({
            id: topic.id,
            status: topic.status,
            excelFilePath: topic.excelFilePath,
            hasTasks: sql<boolean>`exists(
                select 1 from ${task} where ${task.topicId} = ${topic.id}
            )`,
        })
        .from(topic)
        .where(and(eq(topic.id, topicId), eq(topic.teacherId, teacherId), isNull(topic.deletedAt)));

    return row ?? null;
}
