import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, task, topic } from "../../db/schema";
import { validateTopicPublishReadiness } from "./validation";

interface TaskServiceFailure {
    ok: false;
    code: string;
    message: string;
    status: number;
}

interface TaskPublishSuccess {
    ok: true;
    skipped: number[];
}

interface TaskServiceSuccess {
    ok: true;
}

function fail(message: string, code: string, status = 400): TaskServiceFailure {
    return { ok: false, message, code, status };
}

export async function publishTopicTasks(params: {
    teacherId: number;
    topicId: number;
    classIds: number[];
    deadline?: string;
}): Promise<TaskPublishSuccess | TaskServiceFailure> {
    if (!params.topicId || !params.classIds.length) {
        return fail("请选择课题和班级", "VALIDATION_ERROR");
    }

    const [topicRow] = await db
        .select({
            id: topic.id,
            name: topic.name,
            status: topic.status,
            excelFilePath: topic.excelFilePath,
            fieldMapping: topic.fieldMapping,
            weightConfig: topic.weightConfig,
        })
        .from(topic)
        .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), isNull(topic.deletedAt)));
    if (!topicRow) {
        return fail("无权限使用该课题", "FORBIDDEN", 403);
    }
    if (topicRow.status !== 1) {
        return fail("只能发布已发布课题", "VALIDATION_ERROR");
    }

    const publishReadinessError = validateTopicPublishReadiness({
        excelFilePath: topicRow.excelFilePath,
        fieldMapping: topicRow.fieldMapping as Record<string, unknown> | string | null | undefined,
        weightConfig: topicRow.weightConfig as Record<string, unknown> | string | null | undefined,
    });
    if (publishReadinessError) {
        return fail(publishReadinessError, "VALIDATION_ERROR");
    }

    const allowedClasses = await db
        .select({ id: class_.id })
        .from(class_)
        .where(and(eq(class_.teacherId, params.teacherId), sql`${class_.id} IN (${sql.join(params.classIds, sql`, `)})`));
    if (allowedClasses.length !== params.classIds.length) {
        return fail("存在无权限的班级", "FORBIDDEN", 403);
    }

    // 教师端传 ISO-8601 UTC（如 2026-03-23T06:30:00.000Z）；与绝对时刻比较、入库一致
    const deadlineDate = params.deadline?.trim() ? new Date(params.deadline.trim()) : null;
    if (deadlineDate && Number.isNaN(deadlineDate.getTime())) {
        return fail("截止时间无效", "VALIDATION_ERROR");
    }
    if (deadlineDate && deadlineDate <= new Date()) {
        return fail("截止时间必须晚于当前时间", "VALIDATION_ERROR");
    }

    const rowsForTopic = await db
        .select({ id: task.id, classId: task.classId, deletedAt: task.deletedAt })
        .from(task)
        .where(and(eq(task.topicId, params.topicId), sql`${task.classId} IN (${sql.join(params.classIds, sql`, `)})`));

    const classIdToRow = new Map(rowsForTopic.map((r) => [r.classId, r]));
    const skipped: number[] = [];
    const toInsert: number[] = [];
    const toRevive: { taskId: number; classId: number }[] = [];

    for (const classId of params.classIds) {
        const r = classIdToRow.get(classId);
        if (!r) {
            toInsert.push(classId);
        } else if (r.deletedAt == null) {
            skipped.push(classId);
        } else {
            toRevive.push({ taskId: r.id, classId });
        }
    }

    if (toInsert.length > 0 || toRevive.length > 0) {
        await db.transaction(async (tx) => {
            const now = new Date();
            if (toRevive.length > 0) {
                await tx
                    .update(task)
                    .set({ deletedAt: null, openTime: now, deadline: deadlineDate, updatedAt: now })
                    .where(inArray(task.id, toRevive.map((r) => r.taskId)));
            }
            if (toInsert.length > 0) {
                await tx.insert(task).values(
                    toInsert.map((classId) => ({
                        topicId: params.topicId,
                        classId,
                        openTime: now,
                        deadline: deadlineDate,
                    }))
                );
            }

        });
    }

    return { ok: true, skipped };
}

export async function extendTopicTaskDeadline(params: {
    teacherId: number;
    taskId: number;
    deadline: string;
}): Promise<TaskServiceSuccess | TaskServiceFailure> {
    if (!params.deadline) {
        return fail("请输入截止时间", "VALIDATION_ERROR");
    }

    const newDeadline = new Date(params.deadline.trim());
    if (Number.isNaN(newDeadline.getTime())) {
        return fail("截止时间无效", "VALIDATION_ERROR");
    }

    const [row] = await db
        .select({ id: task.id, classId: task.classId, deadline: task.deadline })
        .from(task)
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(
            and(eq(task.id, params.taskId), eq(class_.teacherId, params.teacherId), isNull(task.deletedAt))
        );

    if (!row) {
        return fail("任务不存在", "NOT_FOUND", 404);
    }
    if (newDeadline <= new Date()) {
        return fail("新截止时间必须晚于当前时间", "VALIDATION_ERROR");
    }
    if (row.deadline && new Date(row.deadline) >= newDeadline) {
        return fail("新截止时间必须晚于原截止时间", "VALIDATION_ERROR");
    }

    await db.update(task).set({ deadline: newDeadline, updatedAt: new Date() }).where(eq(task.id, params.taskId));

    return { ok: true };
}

/** 将任务标记为已删除（学生端不再可见）；仅可删除本人班级下的任务 */
export async function softDeleteTeacherTask(params: {
    teacherId: number;
    taskId: number;
}): Promise<TaskServiceSuccess | TaskServiceFailure> {
    const [row] = await db
        .select({ id: task.id })
        .from(task)
        .innerJoin(class_, eq(task.classId, class_.id))
        .where(
            and(eq(task.id, params.taskId), eq(class_.teacherId, params.teacherId), isNull(task.deletedAt))
        );

    if (!row) {
        return fail("任务不存在", "NOT_FOUND", 404);
    }

    const deletedAt = new Date();
    await db.update(task).set({ deletedAt, updatedAt: deletedAt }).where(eq(task.id, params.taskId));
    return { ok: true };
}
