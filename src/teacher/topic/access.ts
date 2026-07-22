import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { topic } from "../../db/schema";

export async function requireTopicOwner(topicId: number, teacherId: number) {
    const [row] = await db
        .select({ id: topic.id, status: topic.status, excelFilePath: topic.excelFilePath })
        .from(topic)
        .where(and(eq(topic.id, topicId), eq(topic.teacherId, teacherId), isNull(topic.deletedAt)));

    return row ?? null;
}
