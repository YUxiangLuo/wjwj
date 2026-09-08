import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { class_, experiment, samplingAttempt, task, topic } from "../../db/schema";
import { acquireStorageMutationLock } from "../../db/storage-mutation-lock";
import { deleteAuditEventsForEntities } from "../../server/audit-event";
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
    if (
        !Number.isInteger(params.topicId)
        || params.topicId <= 0
        || !Array.isArray(params.classIds)
        || params.classIds.length === 0
        || params.classIds.some((classId) => !Number.isInteger(classId) || classId <= 0)
        || new Set(params.classIds).size !== params.classIds.length
    ) {
        return fail("请选择有效的实验模板和班级", "VALIDATION_ERROR");
    }
    if (params.deadline !== undefined && typeof params.deadline !== "string") {
        return fail("截止时间无效", "VALIDATION_ERROR");
    }

    // 教师端传 ISO-8601 UTC（如 2026-03-23T06:30:00.000Z）；与绝对时刻比较、入库一致
    const deadlineDate = params.deadline?.trim() ? new Date(params.deadline.trim()) : null;
    if (deadlineDate && Number.isNaN(deadlineDate.getTime())) {
        return fail("截止时间无效", "VALIDATION_ERROR");
    }
    if (deadlineDate && deadlineDate <= new Date()) {
        return fail("截止时间必须晚于当前时间", "VALIDATION_ERROR");
    }

    // Publishing and storage-backed topic mutations share one transaction lock.
    // The topic is revalidated only after the lock is held, so deletion cannot
    // pass its no-task check between this read and the task insert.
    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [topicRow] = await tx
            .select({
                id: topic.id,
                name: topic.name,
                status: topic.status,
                excelFilePath: topic.excelFilePath,
                fieldMapping: topic.fieldMapping,
                samplingPolicy: topic.samplingPolicy,
                weightConfig: topic.weightConfig,
            })
            .from(topic)
            .where(and(eq(topic.id, params.topicId), eq(topic.teacherId, params.teacherId)));
        if (!topicRow) {
            return fail("无权限使用该实验模板", "FORBIDDEN", 403);
        }
        if (topicRow.status !== 1) {
            return fail("只能使用已发布的实验模板", "VALIDATION_ERROR");
        }

        const publishReadinessError = validateTopicPublishReadiness({
            excelFilePath: topicRow.excelFilePath,
            fieldMapping: topicRow.fieldMapping as Record<string, unknown> | string | null | undefined,
            samplingPolicy: topicRow.samplingPolicy,
            weightConfig: topicRow.weightConfig as Record<string, unknown> | string | null | undefined,
        });
        if (publishReadinessError) {
            return fail(publishReadinessError, "VALIDATION_ERROR");
        }

        const allowedClasses = await tx
            .select({ id: class_.id })
            .from(class_)
            .where(and(eq(class_.teacherId, params.teacherId), sql`${class_.id} IN (${sql.join(params.classIds, sql`, `)})`));
        if (allowedClasses.length !== params.classIds.length) {
            return fail("存在无权限的班级", "FORBIDDEN", 403);
        }

        const rowsForTopic = await tx
            .select({ classId: task.classId })
            .from(task)
            .where(and(eq(task.topicId, params.topicId), sql`${task.classId} IN (${sql.join(params.classIds, sql`, `)})`));

        const existingClassIds = new Set(rowsForTopic.map((row) => row.classId));
        const skipped: number[] = [];
        const toInsert: number[] = [];

        for (const classId of params.classIds) {
            if (existingClassIds.has(classId)) skipped.push(classId);
            else toInsert.push(classId);
        }

        const now = new Date();
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

        return { ok: true as const, skipped };
    });
}

export async function extendTopicTaskDeadline(params: {
    teacherId: number;
    taskId: number;
    deadline: string;
}): Promise<TaskServiceSuccess | TaskServiceFailure> {
    if (typeof params.deadline !== "string" || !params.deadline.trim()) {
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
            and(eq(task.id, params.taskId), eq(class_.teacherId, params.teacherId))
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

    // Keep the deadline monotone across concurrent extensions and include
    // ownership in the write instead of relying only on the preflight lookup.
    const [updated] = await db.update(task)
        .set({ deadline: newDeadline, updatedAt: new Date() })
        .where(and(
            eq(task.id, params.taskId),
            or(isNull(task.deadline), lt(task.deadline, newDeadline)),
            sql`exists (select 1 from ${class_} where ${class_.id} = ${task.classId} and ${class_.teacherId} = ${params.teacherId})`,
        ))
        .returning({ id: task.id });
    if (!updated) return fail("任务已发生变化，请刷新后重新设置截止时间", "VERSION_CONFLICT", 409);

    return { ok: true };
}

/** 永久删除任务及其学生实验；仅可删除本人班级下的任务。 */
export async function deleteTeacherTask(params: {
    teacherId: number;
    taskId: number;
}): Promise<TaskServiceSuccess | TaskServiceFailure> {
    return db.transaction(async (tx) => {
        await acquireStorageMutationLock(tx);
        const [row] = await tx
            .select({ id: task.id })
            .from(task)
            .innerJoin(class_, eq(task.classId, class_.id))
            .where(and(eq(task.id, params.taskId), eq(class_.teacherId, params.teacherId)))
            .for("update");
        if (!row) return fail("任务不存在", "NOT_FOUND", 404);

        const experimentRows = await tx
            .select({ id: experiment.id })
            .from(experiment)
            .where(eq(experiment.taskId, params.taskId));
        const experimentIds = experimentRows.map((item) => item.id);
        const attemptRows = experimentIds.length
            ? await tx
                .select({ id: samplingAttempt.id })
                .from(samplingAttempt)
                .where(inArray(samplingAttempt.experimentId, experimentIds))
            : [];
        await tx.delete(task).where(eq(task.id, params.taskId));
        await deleteAuditEventsForEntities(tx, "sampling_attempt", attemptRows.map((item) => item.id));
        await deleteAuditEventsForEntities(tx, "experiment", experimentIds);
        await deleteAuditEventsForEntities(tx, "task", [params.taskId]);
        return { ok: true };
    });
}
