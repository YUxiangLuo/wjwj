/**
 * Admin API Routes
 * 管理员端 API 接口集合
 */

import { db } from "../db";
import {
    semester,
    teacher,
    assistant,
    class_,
    student,
    loginLog,
    operationLog,
    submission,
    systemConfig,
    userSession,
} from "../db/schema";
import { eq, desc, sql, and, count } from "drizzle-orm";
import {
    error,
    json,
} from "../server/http";
import {
    adminLoginRoutes,
    adminLogoutRoutes,
    adminMeRoutes,
    adminPasswordRoutes,
    withAdminAuth,
} from "./routes/auth";
import { backupCreateRoutes, backupListRoutes, backupRestoreRoutes } from "./routes/backup";
import {
    announcementPublishRoutes,
    announcementRoutes,
    announcementStatsRoutes,
    announcementUnpublishRoutes,
    announcementUpdateRoutes,
    assistantDeleteRoutes,
    assistantResetPasswordRoutes,
    assistantRoutes,
    assistantStatusRoutes,
    assistantUnlockRoutes,
    classRoutes,
    classUpdateRoutes,
    semesterCurrentRoutes,
    semesterDeleteRoutes,
    semesterRoutes,
    studentExperimentsRoutes,
    studentResetPasswordRoutes,
    studentRoutes,
    studentStatusRoutes,
    studentTransferRoutes,
    teacherResetPasswordRoutes,
    teacherRoutes,
    teacherStatusRoutes,
    teacherUnlockRoutes,
} from "./routes/management";
import { notificationMarkReadRoutes, notificationReadAllRoutes, notificationRoutes } from "./routes/notifications";
import { semesterUpdateRoutes } from "./routes/semester";

// ============================================================
// Types
// ============================================================

let lastNetSample: { time: number; bytes: number } | null = null;
// ============================================================
// Stats API
// ============================================================

const statsRoutes = {
    async GET() {
        // Basic counts
        const [semesterCount] = await db.select({ count: count() }).from(semester);
        const [teacherCount] = await db.select({ count: count() }).from(teacher);
        const [classCount] = await db.select({ count: count() }).from(class_);
        const [studentCount] = await db.select({ count: count() }).from(student);
        const [assistantCount] = await db.select({ count: count() }).from(assistant);

        // Current semester
        const [currentSem] = await db
            .select()
            .from(semester)
            .where(eq(semester.isCurrent, 1))
            .limit(1);

        // Today's Stats
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Today Logins
        const [todayLogins] = await db
            .select({ count: count() })
            .from(loginLog)
            .where(sql`${loginLog.loginAt} >= ${startOfDay}`);

        // Today Active Users (Distinct users who logged in)
        // Using sql within select to ensure correct return type integration
        const [activeUserStat] = await db
            .select({
                count: sql<number>`count(distinct ${loginLog.userType}, ${loginLog.userId})`
            })
            .from(loginLog)
            .where(sql`${loginLog.loginAt} >= ${startOfDay}`);

        // Pending Items (e.g. ungraded submissions)
        const [pendingSubs] = await db
            .select({ count: count() })
            .from(submission)
            .where(eq(submission.status, 1));

        const pendingItems = pendingSubs?.count ?? 0;

        return json({
            currentSemester: currentSem?.name ?? "未设置",
            teacherCount: teacherCount?.count ?? 0,
            classCount: classCount?.count ?? 0,
            studentCount: studentCount?.count ?? 0,
            assistantCount: assistantCount?.count ?? 0,
            todayLogins: todayLogins?.count ?? 0,
            todayActiveUsers: Number(activeUserStat?.count ?? 0),
            pendingItems: pendingItems,
        });
    },
};

// ============================================================
// System Metrics API
// ============================================================

const systemMetricsRoutes = {
    async GET() {
        const os = await import("node:os");

        // Memory
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memUsage = Math.round((usedMem / totalMem) * 100);

        // CPU (Approximation using loadavg)
        const cpus = os.cpus();
        const load = os.loadavg()[0] ?? 0; // 1 min load average
        const cpuUsage = Math.min(Math.round((load / cpus.length) * 100), 100);

        // Disk usage using df -Pk
        let diskUsage = 0;
        try {
            const dfProcess = Bun.spawn({
                cmd: ["df", "-Pk", "."],
                stdout: "pipe",
                stderr: "pipe",
            });
            const output = await new Response(dfProcess.stdout).text();
            await dfProcess.exited;
            const lines = output.trim().split("\n");
            if (lines.length > 1 && lines[1]) {
                const parts = lines[1].trim().split(/\s+/);
                const usedPercent = parts[4] ?? "0%";
                diskUsage = Math.min(Math.max(parseInt(usedPercent.replace("%", ""), 10) || 0, 0), 100);
            }
        } catch {
            diskUsage = 0;
        }

        // Network throughput using /proc/net/dev (Mbps)
        let networkMbps = 0;
        try {
            const netText = await Bun.file("/proc/net/dev").text();
            const lines = netText.trim().split("\n").slice(2);
            const totalBytes = lines.reduce((sum, line) => {
                const [ifacePart, rest] = line.split(":");
                const iface = ifacePart?.trim();
                if (!iface || iface === "lo" || !rest) return sum;
                const cols = rest.trim().split(/\s+/).map(Number);
                const rx = cols[0] ?? 0;
                const tx = cols[8] ?? 0;
                return sum + rx + tx;
            }, 0);

            const now = Date.now();
            if (lastNetSample) {
                const deltaBytes = totalBytes - lastNetSample.bytes;
                const deltaSeconds = (now - lastNetSample.time) / 1000;
                if (deltaSeconds > 0 && deltaBytes >= 0) {
                    networkMbps = Math.round((deltaBytes * 8) / (deltaSeconds * 1_000_000));
                }
            }
            lastNetSample = { time: now, bytes: totalBytes };
        } catch {
            networkMbps = 0;
        }

        // Active Connections (Approximation using recent login logs or session table)
        // Since we don't have a direct "active connection" counter in this stateless setup,
        // we can count distinct users who logged in or had activity in the last 15 minutes.
        // For now, let's use a simple query on loginLog for the last 1 day as a rough "active today" proxy, 
        // OR better, checking 'user_session' table if we are using it (schema has userSession).
        // Let's use userSession table for active connections (valid sessions).
        const [sessionCount] = await db
            .select({ count: count() })
            .from(userSession)
            .where(
                and(
                    sql`${userSession.expiresAt} > NOW()`,
                    sql`${userSession.lastActiveAt} > DATE_SUB(NOW(), INTERVAL 30 MINUTE)` // Active in last 30 mins
                )
            );

        const activeConnections = sessionCount?.count ?? 0;

        return json({
            cpu: cpuUsage,
            memory: memUsage,
            disk: diskUsage,
            network: networkMbps,
            activeConnections: activeConnections,
        });
    },
};

const systemSettingsRoutes = {
    async GET() {
        const configs = await db.select().from(systemConfig);

        // Convert array to key-value object
        const settings: Record<string, any> = {};

        configs.forEach(c => {
            if (c.valueType === 'boolean') {
                settings[c.configKey] = c.configValue === 'true';
            } else if (c.valueType === 'number') {
                settings[c.configKey] = Number(c.configValue);
            } else {
                settings[c.configKey] = c.configValue;
            }
        });

        return json(settings);
    },

    async PUT(req: Request) {
        const body = await req.json();

        // Loop through keys and upsert
        for (const [key, value] of Object.entries(body)) {
            let valStr = String(value);
            let valType = "string";

            if (typeof value === "boolean") {
                valType = "boolean";
                valStr = value ? "true" : "false";
            } else if (typeof value === "number") {
                valType = "number";
            }

            await db.insert(systemConfig).values({
                configKey: key,
                configValue: valStr,
                valueType: valType,
            }).onDuplicateKeyUpdate({
                set: {
                    configValue: valStr,
                    valueType: valType,
                }
            });
        }

        // Log operation
        // (Simplified, normally get real user ID)
        await db.insert(operationLog).values({
            userType: 1, // Admin (assuming)
            userId: 0, // System
            action: 'UPDATE_SETTINGS',
            targetType: 'system',
            detail: body,
            ipAddress: '127.0.0.1'
        });

        return json({ success: true });
    },
};

const systemLogsRoutes = {
    async GET() {
        // Fetch recent operation logs and login logs, combine and sort
        const ops = await db
            .select({
                id: operationLog.id,
                type: sql<string>`'OPERATION'`,
                time: operationLog.createdAt,
                message: operationLog.action,
                detail: operationLog.detail,
            })
            .from(operationLog)
            .orderBy(desc(operationLog.createdAt))
            .limit(20);

        const logins = await db
            .select({
                id: loginLog.id,
                type: sql<string>`'LOGIN'`,
                time: loginLog.loginAt,
                message: sql<string>`concat('用户 ', ${loginLog.userId}, ' (', ${loginLog.userType}, ') 登录')`,
                detail: sql<string>`''`,
            })
            .from(loginLog)
            .orderBy(desc(loginLog.loginAt))
            .limit(20);

        // Combine and sort
        const logs = [...ops, ...logins]
            .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
            .slice(0, 20)
            .map(log => ({
                id: `${log.type}_${log.id}`,
                time: log.time,
                level: "INFO",
                message: log.message,
                source: log.type === 'LOGIN' ? 'AuthService' : 'Admin',
            }));

        return json(logs);
    },
};

// ============================================================
// Export Routes
// ============================================================

export const adminApiRoutes = {
    // Auth
    "/api/admin/login": adminLoginRoutes,
    "/api/admin/me": adminMeRoutes,
    "/api/admin/logout": adminLogoutRoutes,
    "/api/admin/password": withAdminAuth(adminPasswordRoutes),

    // Stats
    "/api/admin/stats": withAdminAuth(statsRoutes),
    "/api/admin/notifications": withAdminAuth(notificationRoutes),
    "/api/admin/notifications/:id/read": withAdminAuth(notificationMarkReadRoutes),
    "/api/admin/notifications/read-all": withAdminAuth(notificationReadAllRoutes),

    // Semesters
    "/api/admin/semesters": withAdminAuth(semesterRoutes),
    "/api/admin/semesters/:id/current": withAdminAuth(semesterCurrentRoutes),
    "/api/admin/semesters/:id": withAdminAuth(semesterDeleteRoutes),
    "/api/admin/semesters/:id/update": withAdminAuth(semesterUpdateRoutes),

    // Teachers
    "/api/admin/teachers": withAdminAuth(teacherRoutes),
    "/api/admin/teachers/:id/status": withAdminAuth(teacherStatusRoutes),
    "/api/admin/teachers/:id/unlock": withAdminAuth(teacherUnlockRoutes),
    "/api/admin/teachers/:id/reset-password": withAdminAuth(teacherResetPasswordRoutes),

    // Assistants
    "/api/admin/assistants": withAdminAuth(assistantRoutes),
    "/api/admin/assistants/:id/status": withAdminAuth(assistantStatusRoutes),
    "/api/admin/assistants/:id/unlock": withAdminAuth(assistantUnlockRoutes),
    "/api/admin/assistants/:id/reset-password": withAdminAuth(assistantResetPasswordRoutes),
    "/api/admin/assistants/:id": withAdminAuth(assistantDeleteRoutes),

    // Classes
    "/api/admin/classes": withAdminAuth(classRoutes),
    "/api/admin/classes/:id": withAdminAuth(classUpdateRoutes),

    // Students
    "/api/admin/students": withAdminAuth(studentRoutes),
    "/api/admin/students/:id/status": withAdminAuth(studentStatusRoutes),
    "/api/admin/students/:id/reset-password": withAdminAuth(studentResetPasswordRoutes),
    "/api/admin/students/:id/transfer": withAdminAuth(studentTransferRoutes),
    "/api/admin/students/:id/experiments": withAdminAuth(studentExperimentsRoutes),

    // Announcements
    "/api/admin/announcements": withAdminAuth(announcementRoutes),
    "/api/admin/announcements/:id": withAdminAuth(announcementUpdateRoutes),
    "/api/admin/announcements/:id/publish": withAdminAuth(announcementPublishRoutes),
    "/api/admin/announcements/:id/unpublish": withAdminAuth(announcementUnpublishRoutes),
    "/api/admin/announcements/:id/stats": withAdminAuth(announcementStatsRoutes),

    // System
    "/api/admin/system/metrics": withAdminAuth(systemMetricsRoutes),
    "/api/admin/system/logs": withAdminAuth(systemLogsRoutes),
    "/api/admin/settings": withAdminAuth(systemSettingsRoutes),
    "/api/admin/backups": withAdminAuth(backupListRoutes),
    "/api/admin/backup": withAdminAuth(backupCreateRoutes),
    "/api/admin/restore": withAdminAuth(backupRestoreRoutes),
};
