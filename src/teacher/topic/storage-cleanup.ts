import { and, count, eq, ne } from "drizzle-orm";
import { db } from "../../db";
import { topic, topicAttachment } from "../../db/schema";
import { acquireStorageMutationLock } from "../../db/storage-mutation-lock";
import { deleteStorageFileIfExists } from "../../server/storage-files";

/**
 * Delete a storage object only while the global mutation lock is held and no
 * topic or attachment metadata still references it. This keeps legacy/shared
 * paths safe and coordinates with storage:audit.
 */
export async function deleteTopicStorageFileIfUnreferenced(
    filePath: string,
    options?: { excludeTopicId?: number },
) {
    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const topicReferenceCondition = options?.excludeTopicId
            ? and(eq(topic.excelFilePath, filePath), ne(topic.id, options.excludeTopicId))
            : eq(topic.excelFilePath, filePath);
        const [topicRef] = await tx.select({ count: count() }).from(topic).where(topicReferenceCondition);
        const [attachmentRef] = await tx.select({ count: count() }).from(topicAttachment).where(eq(topicAttachment.filePath, filePath));
        if ((topicRef?.count ?? 0) > 0 || (attachmentRef?.count ?? 0) > 0) return false;
        await deleteStorageFileIfExists(filePath);
        return true;
    });
}
