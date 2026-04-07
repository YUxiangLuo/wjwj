import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { readdir, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { createBackupArtifacts } from "../admin/backup";
import { db } from "../db";
import { admin, experiment, notification, operationLog, student, systemConfig, task, topic } from "../db/schema";
import { processPendingSubmissionPdfs } from "../student/experiment/submission-pdf";
import { formatDateTimeCN } from "../utils/format";

const AUTO_BACKUP_CHECK_INTERVAL_MS = 5 * 60 * 1000;
const AUTO_BACKUP_LEASE_MS = 60 * 60 * 1000;
const NOTIFICATION_CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;
const NOTIFICATION_CLEANUP_LEASE_MS = 30 * 60 * 1000;
const DEFAULT_NOTIFICATION_RETENTION_DAYS = 90;
const DEADLINE_REMINDER_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const DEADLINE_REMINDER_LEASE_MS = 2 * 60 * 60 * 1000;
const DEFAULT_DEADLINE_REMINDER_HOURS = 24;
const SUBMISSION_PDF_CHECK_INTERVAL_MS = 10 * 1000;
const SUBMISSION_PDF_LEASE_MS = 60 * 1000;

const schedulerOwnerId = `scheduler-${process.pid}-${crypto.randomUUID().slice(0, 8)}`;

let autoBackupRunning = false;
let notificationCleanupRunning = false;
let deadlineReminderRunning = false;
let submissionPdfRunning = false;

function getFrequencyMs(freq: string) {
    switch (freq) {
        case "hourly":
            return 60 * 60 * 1000;
        case "weekly":
            return 7 * 24 * 60 * 60 * 1000;
        case "daily":
        default:
            return 24 * 60 * 60 * 1000;
    }
}

function getResultHeader(result: unknown) {
    if (Array.isArray(result) && result.length > 0 && result[0] && typeof result[0] === "object") {
        return result[0] as { affectedRows?: number };
    }

    if (result && typeof result === "object") {
        return result as { affectedRows?: number };
    }

    return null;
}

async function upsertConfig(key: string, value: string, valueType: "string" | "number" | "boolean" = "string") {
    await db.insert(systemConfig).values({
        configKey: key,
        configValue: value,
        valueType,
    }).onDuplicateKeyUpdate({
        set: { configValue: value, valueType },
    });
}

async function tryAcquireJobLease(jobName: string, leaseMs: number) {
    const leaseKey = `scheduler.${jobName}.lease`;
    const leaseUntil = Date.now() + leaseMs;
    const leaseValue = `${schedulerOwnerId}:${leaseUntil}`;

    const result = await db.execute(sql`
        INSERT INTO system_config (config_key, config_value, value_type, description)
        VALUES (${leaseKey}, ${leaseValue}, 'string', ${`scheduler lease for ${jobName}`})
        ON DUPLICATE KEY UPDATE
            config_value = IF(
                CAST(SUBSTRING_INDEX(config_value, ':', -1) AS UNSIGNED) < ${Date.now()}
                OR SUBSTRING_INDEX(config_value, ':', 1) = ${schedulerOwnerId},
                ${leaseValue},
                config_value
            ),
            value_type = 'string',
            description = ${`scheduler lease for ${jobName}`}
    `);

    return (getResultHeader(result)?.affectedRows ?? 0) > 0;
}

async function releaseJobLease(jobName: string) {
    const leaseKey = `scheduler.${jobName}.lease`;
    await db.execute(sql`
        UPDATE system_config
        SET config_value = ${`${schedulerOwnerId}:0`}, value_type = 'string'
        WHERE config_key = ${leaseKey}
          AND SUBSTRING_INDEX(config_value, ':', 1) = ${schedulerOwnerId}
    `);
}

async function runWithLease(jobName: string, leaseMs: number, job: () => Promise<void>) {
    const acquired = await tryAcquireJobLease(jobName, leaseMs);
    if (!acquired) {
        return false;
    }

    try {
        await job();
        return true;
    } finally {
        await releaseJobLease(jobName).catch((error) => {
            console.error(`Failed to release ${jobName} lease:`, error);
        });
    }
}

async function cleanupExpiredBackups(retentionDays: number) {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
    const backupDir = join(process.cwd(), "backups");
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    try {
        const entries = await readdir(backupDir);
        const sqlFiles = entries.filter((file) => extname(file) === ".sql");

        for (const sqlFile of sqlFiles) {
            const sqlPath = join(backupDir, sqlFile);
            const fileStat = await stat(sqlPath);
            if (fileStat.mtime.getTime() < cutoff) {
                const baseName = sqlFile.replace(/\.sql$/, "");
                const zipPath = join(backupDir, `${baseName}.zip`);
                await unlink(sqlPath).catch(() => undefined);
                await unlink(zipPath).catch(() => undefined);
            }
        }
    } catch {
        // ignore cleanup errors
    }
}

async function checkAndRunAutoBackup() {
    if (autoBackupRunning) return;
    autoBackupRunning = true;

    try {
        await runWithLease("auto_backup", AUTO_BACKUP_LEASE_MS, async () => {
            const keys = [
                "enable_backup",
                "backup_frequency",
                "backup.last_run_at",
                "backup.last_backup_id",
                "backup.retention_days",
            ];
            const rows = await db
                .select({ key: systemConfig.configKey, value: systemConfig.configValue, valueType: systemConfig.valueType })
                .from(systemConfig)
                .where(inArray(systemConfig.configKey, keys));

            const config: Record<string, string> = {};
            rows.forEach((row) => {
                config[row.key] = row.value;
            });

            const enableBackup = (config["enable_backup"] ?? "false") === "true";
            const frequency = config["backup_frequency"] ?? "daily";
            const lastRunAt = config["backup.last_run_at"] ? new Date(config["backup.last_run_at"]).getTime() : 0;
            const retentionDays = Number(config["backup.retention_days"] ?? 30) || 30;

            if (!enableBackup) return;

            const frequencyMs = getFrequencyMs(frequency);
            if (Number.isFinite(lastRunAt) && Date.now() - lastRunAt < frequencyMs) return;

            const result = await createBackupArtifacts("auto");
            if (!result.ok) {
                await db.insert(operationLog).values({
                    userType: 1,
                    userId: 0,
                    action: "AUTO_BACKUP_FAILED",
                    targetType: "system",
                    detail: { error: result.error, code: result.code },
                    ipAddress: "127.0.0.1",
                });

                const admins = await db.select({ id: admin.id }).from(admin);
                if (admins.length > 0) {
                    await db.insert(notification).values(
                        admins.map((a) => ({
                            receiverType: 1,
                            receiverId: a.id,
                            type: "AUTO_BACKUP_FAILED",
                            title: "自动备份失败",
                            content: `自动备份失败：${result.error}`,
                        }))
                    );
                }
                return;
            }

            await upsertConfig("backup.last_run_at", new Date().toISOString());
            await upsertConfig("backup.last_backup_id", result.backupId);

            await db.insert(operationLog).values({
                userType: 1,
                userId: 0,
                action: "AUTO_BACKUP",
                targetType: "system",
                detail: { backupId: result.backupId, sqlPath: result.sqlPath, zipPath: result.zipPath },
                ipAddress: "127.0.0.1",
            });

            const admins = await db.select({ id: admin.id }).from(admin);
            if (admins.length > 0) {
                await db.insert(notification).values(
                    admins.map((a) => ({
                        receiverType: 1,
                        receiverId: a.id,
                        type: "AUTO_BACKUP_CREATED",
                        title: "自动备份已完成",
                        content: `自动备份 ${result.backupId} 已创建成功。`,
                    }))
                );
            }

            await cleanupExpiredBackups(retentionDays);
        });
    } catch (error) {
        console.error("Auto backup failed:", error);
        try {
            const admins = await db.select({ id: admin.id }).from(admin);
            if (admins.length > 0) {
                await db.insert(notification).values(
                    admins.map((a) => ({
                        receiverType: 1,
                        receiverId: a.id,
                        type: "AUTO_BACKUP_FAILED",
                        title: "自动备份异常",
                        content: `自动备份异常：${error instanceof Error ? error.message : "未知错误"}`,
                    }))
                );
            }
        } catch (notifyError) {
            console.error("Auto backup notify failed:", notifyError);
        }
    } finally {
        autoBackupRunning = false;
    }
}

async function checkAndCleanupNotifications() {
    if (notificationCleanupRunning) return;
    notificationCleanupRunning = true;

    try {
        await runWithLease("notification_cleanup", NOTIFICATION_CLEANUP_LEASE_MS, async () => {
            const rows = await db
                .select({ key: systemConfig.configKey, value: systemConfig.configValue })
                .from(systemConfig)
                .where(inArray(systemConfig.configKey, ["notification.retention_days"]));

            const configuredDays = Number(rows.find((row) => row.key === "notification.retention_days")?.value ?? "");
            const retentionDays = Number.isFinite(configuredDays) && configuredDays > 0
                ? configuredDays
                : DEFAULT_NOTIFICATION_RETENTION_DAYS;

            const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
            await db.delete(notification).where(lt(notification.createdAt, cutoff));
        });
    } catch (error) {
        console.error("Notification cleanup failed:", error);
    } finally {
        notificationCleanupRunning = false;
    }
}

async function checkAndSendDeadlineReminders() {
    if (deadlineReminderRunning) return;
    deadlineReminderRunning = true;

    try {
        await runWithLease("deadline_reminder", DEADLINE_REMINDER_LEASE_MS, async () => {
            const rows = await db
                .select({ key: systemConfig.configKey, value: systemConfig.configValue })
                .from(systemConfig)
                .where(inArray(systemConfig.configKey, ["notification.deadline_reminder_hours"]));

            const configuredHours = Number(rows.find((row) => row.key === "notification.deadline_reminder_hours")?.value ?? "");
            const reminderHours = Number.isFinite(configuredHours) && configuredHours > 0
                ? configuredHours
                : DEFAULT_DEADLINE_REMINDER_HOURS;

            const now = new Date();
            const reminderWindowEnd = new Date(now.getTime() + reminderHours * 60 * 60 * 1000);

            const dueTasks = await db
                .select({
                    taskId: task.id,
                    classId: task.classId,
                    deadline: task.deadline,
                    topicName: topic.name,
                })
                .from(task)
                .innerJoin(topic, eq(task.topicId, topic.id))
                .where(and(
                    isNull(task.deletedAt),
                    eq(topic.isDeleted, 0),
                    isNull(topic.deletedAt),
                    isNotNull(task.deadline),
                    gte(task.deadline, now),
                    lte(task.deadline, reminderWindowEnd),
                ));

            for (const dueTask of dueTasks) {
                if (!dueTask.deadline) continue;

                const studentsInClass = await db
                    .select({ id: student.id })
                    .from(student)
                    .where(and(
                        eq(student.classId, dueTask.classId),
                        eq(student.status, 1),
                        isNull(student.deletedAt),
                    ));

                if (studentsInClass.length === 0) continue;

                const studentIds = studentsInClass.map((s) => s.id);
                const experimentRows = await db
                    .select({ studentId: experiment.studentId, status: experiment.status })
                    .from(experiment)
                    .where(and(
                        eq(experiment.taskId, dueTask.taskId),
                        inArray(experiment.studentId, studentIds),
                    ));

                const submittedStudentIds = new Set(
                    experimentRows
                        .filter((row) => row.status === 1 || row.status === 2)
                        .map((row) => row.studentId)
                );

                const remindStudentIds = studentIds.filter((studentId) => !submittedStudentIds.has(studentId));
                if (remindStudentIds.length === 0) continue;

                const existingReminderRows = await db
                    .select({ receiverId: notification.receiverId })
                    .from(notification)
                    .where(and(
                        eq(notification.receiverType, 4),
                        inArray(notification.receiverId, remindStudentIds),
                        eq(notification.type, "DEADLINE_REMINDER"),
                        eq(notification.relatedType, "task"),
                        eq(notification.relatedId, dueTask.taskId),
                    ));

                const existingReceiverIds = new Set(existingReminderRows.map((row) => row.receiverId));
                const deadlineMs = dueTask.deadline.getTime();
                if (!Number.isFinite(deadlineMs)) continue;
                const remainingHours = Math.max(1, Math.ceil((deadlineMs - Date.now()) / (60 * 60 * 1000)));
                const deadlineText = formatDateTimeCN(dueTask.deadline);

                const reminderInserts = remindStudentIds
                    .filter((studentId) => !existingReceiverIds.has(studentId))
                    .map((studentId) => ({
                        receiverType: 4,
                        receiverId: studentId,
                        type: "DEADLINE_REMINDER",
                        title: "任务即将截止",
                        content: `任务「${dueTask.topicName}」将于${remainingHours}小时后截止（${deadlineText}），请尽快完成提交。`,
                        relatedType: "task",
                        relatedId: dueTask.taskId,
                    }));

                if (reminderInserts.length > 0) {
                    await db.insert(notification).values(reminderInserts);
                }
            }
        });
    } catch (error) {
        console.error("Deadline reminder scheduler failed:", error);
    } finally {
        deadlineReminderRunning = false;
    }
}

async function checkAndProcessSubmissionPdfs() {
    if (submissionPdfRunning) return;
    submissionPdfRunning = true;

    try {
        await runWithLease("submission_pdf", SUBMISSION_PDF_LEASE_MS, async () => {
            await processPendingSubmissionPdfs();
        });
    } catch (error) {
        console.error("Submission PDF scheduler failed:", error);
    } finally {
        submissionPdfRunning = false;
    }
}

export function startBackgroundJobs() {
    const timers: Array<ReturnType<typeof setInterval>> = [];

    if (process.env.DISABLE_AUTO_BACKUP !== "1") {
        timers.push(setInterval(checkAndRunAutoBackup, AUTO_BACKUP_CHECK_INTERVAL_MS));
        void checkAndRunAutoBackup();
    }

    if (process.env.DISABLE_NOTIFICATION_CLEANUP !== "1") {
        timers.push(setInterval(checkAndCleanupNotifications, NOTIFICATION_CLEANUP_INTERVAL_MS));
        void checkAndCleanupNotifications();
    }

    if (process.env.DISABLE_DEADLINE_REMINDER !== "1") {
        timers.push(setInterval(checkAndSendDeadlineReminders, DEADLINE_REMINDER_CHECK_INTERVAL_MS));
        void checkAndSendDeadlineReminders();
    }

    timers.push(setInterval(checkAndProcessSubmissionPdfs, SUBMISSION_PDF_CHECK_INTERVAL_MS));
    void checkAndProcessSubmissionPdfs();

    return () => {
        timers.forEach((timer) => clearInterval(timer));
    };
}
