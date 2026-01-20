import { serve } from "bun";
import adminPage from "./admin/admin.html";
import teacherPage from "./teacher/teacher.html";
import studentPage from "./student/student.html";
import { adminApiRoutes } from "./admin/api";
import { studentApiRoutes } from "./student/api";
import { teacherApiRoutes } from "./teacher/api";
import { db } from "./db";
import { systemConfig, operationLog, admin, notification } from "./db/schema";
import { inArray } from "drizzle-orm";
import { readdir, stat, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { createBackupArtifacts } from "./admin/backup";

type RouteRequest = Request & { params: Record<string, string> };

const routes = {
    "/student": studentPage,
    "/student/*": studentPage,

    // Admin panel
    "/admin": adminPage,
    "/admin/*": adminPage,

    // Teacher panel
    "/teacher": teacherPage,
    "/teacher/*": teacherPage,

    // Admin API routes
    ...adminApiRoutes,

    // Student API routes
    ...studentApiRoutes,

    // Teacher API routes
    ...teacherApiRoutes,

    // API endpoints (example)
    "/api/hello": {
      async GET(req: Request) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req: Request) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req: RouteRequest) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
};

const server = serve({
  routes,

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);

// ============================================================
// Auto Backup Scheduler
// ============================================================

const AUTO_BACKUP_CHECK_INTERVAL_MS = 5 * 60 * 1000;
let autoBackupRunning = false;

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

async function upsertConfig(key: string, value: string, valueType: "string" | "number" | "boolean" = "string") {
  await db.insert(systemConfig).values({
    configKey: key,
    configValue: value,
    valueType,
  }).onDuplicateKeyUpdate({
    set: { configValue: value, valueType },
  });
}

async function checkAndRunAutoBackup() {
  if (autoBackupRunning) return;
  autoBackupRunning = true;

  try {
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
    if (Date.now() - lastRunAt < frequencyMs) return;

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

setInterval(checkAndRunAutoBackup, AUTO_BACKUP_CHECK_INTERVAL_MS);
checkAndRunAutoBackup();
