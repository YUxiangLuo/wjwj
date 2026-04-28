import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, notification, task, topic } from "../../db/schema";
import { formatDateTimeCN } from "../../utils/format";
import { notifyStudentsByClassIds } from "../routes/auth";
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

const ZONED_ISO_INSTANT_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

function isValidCalendarDate(year: number, month: number, day: number) {
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function parseZonedIsoInstant(value: string) {
    const trimmed = value.trim();
    const match = ZONED_ISO_INSTANT_PATTERN.exec(trimmed);
    if (!match) return null;
    const [, ys, ms, ds, hs, mins, ss = "0", zone] = match;
    const year = Number(ys);
    const month = Number(ms);
    const day = Number(ds);
    const hour = Number(hs);
    const minute = Number(mins);
    const second = Number(ss);
    if (
        !Number.isInteger(year) ||
        !isValidCalendarDate(year, month, day) ||
        hour < 0 || hour > 23 ||
        minute < 0 || minute > 59 ||
        second < 0 || second > 59
    ) {
        return null;
    }
    if (zone && zone !== "Z") {
        const zoneHour = Number(zone.slice(1, 3));
        const zoneMinute = Number(zone.slice(4, 6));
        if (zoneHour > 23 || zoneMinute > 59) return null;
    }
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
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

    const deadlineDate = params.deadline?.trim() ? parseZonedIsoInstant(params.deadline) : null;
    if (params.deadline?.trim() && !deadlineDate) {
        return fail("截止时间无效", "VALIDATION_ERROR");
    }
    if (deadlineDate && deadlineDate <= new Date()) {
        return fail("截止时间必须晚于当前时间", "VALIDATION_ERROR");
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
        .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId), eq(topic.isDeleted, 0)));
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
                    .set({ deletedAt: null, openTime: now, deadline: deadlineDate })
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

            const deadlineText = deadlineDate ? formatDateTimeCN(deadlineDate) : "无限制";
            const notifiedClasses = [...toRevive.map((r) => r.classId), ...toInsert];
            await notifyStudentsByClassIds(notifiedClasses, {
                type: "TASK_PUBLISHED",
                title: "新任务已发布",
                content: `教师发布了新任务「${topicRow.name ?? "未命名课题"}」，截止时间：${deadlineText}`,
                relatedType: "topic",
                relatedId: params.topicId,
            }, tx);
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

    const newDeadline = parseZonedIsoInstant(params.deadline);
    if (!newDeadline) {
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

    await db.transaction(async (tx) => {
        await tx.update(task).set({ deadline: newDeadline }).where(eq(task.id, params.taskId));
        await tx.delete(notification).where(and(
            eq(notification.receiverType, 4),
            eq(notification.type, "DEADLINE_REMINDER"),
            eq(notification.relatedType, "task"),
            eq(notification.relatedId, params.taskId),
        ));
        await notifyStudentsByClassIds([row.classId], {
            type: "TASK_EXTENDED",
            title: "截止时间已延长",
            content: `任务截止时间已延长至 ${formatDateTimeCN(newDeadline)}`,
            relatedType: "task",
            relatedId: params.taskId,
        }, tx);
    });

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

    await db.update(task).set({ deletedAt: new Date() }).where(eq(task.id, params.taskId));
    return { ok: true };
}
