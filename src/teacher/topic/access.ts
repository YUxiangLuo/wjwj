import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { topic } from "../../db/schema";

export async function requireTopicOwner(topicId: number, teacherId: number) {
    const [row] = await db
        .select({ id: topic.id, status: topic.status })
        .from(topic)
        .where(and(eq(topic.id, topicId), eq(topic.teacherId, teacherId), eq(topic.isDeleted, 0)));

    return row ?? null;
}
