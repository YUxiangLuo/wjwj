import { and, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { task, topic } from "../../db/schema";
import { error } from "../../server/http";

/**
 * 通用的活跃/已删除状态检测逻辑：
 * 1. 查是否有活跃行（未删除的 task + 未删除的 topic）→ 有则允许访问
 * 2. 否则查是否存在行 → 根据删除原因返回对应错误码
 * 3. 都查不到 → 返回 fallback 错误
 */
async function checkAccess(
    activeConditions: SQL[],
    existenceConditions: SQL[],
    fallbackMessage: string,
    fallbackCode: string,
    fallbackStatus: number,
): Promise<Response | null> {
    const sharedActiveFilters: SQL[] = [
        isNull(task.deletedAt),
        isNull(topic.deletedAt),
        eq(topic.status, 1),
    ];

    const [activeRow] = await db
        .select({ id: task.id })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(and(...activeConditions, ...sharedActiveFilters));

    if (activeRow) return null;

    const [row] = await db
        .select({
            taskDeletedAt: task.deletedAt,
            topicDeletedAt: topic.deletedAt,
            topicStatus: topic.status,
        })
        .from(task)
        .innerJoin(topic, eq(task.topicId, topic.id))
        .where(and(...existenceConditions))
        .limit(1);

    if (!row) {
        return error(fallbackMessage, fallbackCode, fallbackStatus);
    }

    const topicUnavailable = row.topicDeletedAt !== null;
    if (topicUnavailable) {
        return error("课题已删除", "TOPIC_DELETED", 410);
    }
    if (row.taskDeletedAt !== null) {
        return error("任务已撤销", "TASK_REVOKED", 410);
    }
    if (row.topicStatus !== 1) {
        return error("课题未发布", "TOPIC_UNAVAILABLE", 404);
    }

    return error(fallbackMessage, fallbackCode, fallbackStatus);
}

export async function getStudentTaskAccessError(taskId: number, classId: number): Promise<Response | null> {
    return checkAccess(
        [eq(task.id, taskId), eq(task.classId, classId)],
        [eq(task.id, taskId), eq(task.classId, classId)],
        "任务不存在",
        "NOT_FOUND",
        404,
    );
}

/** 按课题 + 班级判断附件是否仍可访问（同一课题在同一班级通常对应一条任务）。 */
export async function getStudentTopicAttachmentAccessError(topicId: number, classId: number): Promise<Response | null> {
    return checkAccess(
        [eq(task.topicId, topicId), eq(task.classId, classId)],
        [eq(task.topicId, topicId), eq(task.classId, classId)],
        "无权限访问该附件",
        "FORBIDDEN",
        403,
    );
}
