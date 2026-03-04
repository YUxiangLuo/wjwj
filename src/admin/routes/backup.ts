import { access, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { admin, notification, operationLog, userSession } from "../../db/schema";
import { clearSessionCookie, error, getClientIp, getCookieValue, isSecureRequest, json, parseBody } from "../../server/http";
import type { RouteDefinition } from "../../server/route-types";
import { createBackupArtifacts } from "../backup";
import { ADMIN_SESSION_COOKIE, ADMIN_USER_TYPE, requireAdminAuth } from "./auth";

const backupCreateRoutes: RouteDefinition = {
    async POST(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        const result = await createBackupArtifacts("backup");
        if (!result.ok) {
            await db.insert(notification).values({
                receiverType: ADMIN_USER_TYPE,
                receiverId: auth.admin!.id,
                type: "BACKUP_FAILED",
                title: "备份失败",
                content: `备份失败：${result.error}`,
            });
            return error(result.error, result.code, 500);
        }

        await db.insert(operationLog).values({
            userType: ADMIN_USER_TYPE,
            userId: auth.admin!.id,
            action: "CREATE_BACKUP",
            targetType: "system",
            detail: { backupId: result.backupId, sqlPath: result.sqlPath, zipPath: result.zipPath },
            ipAddress: getClientIp(req),
        });

        await db.insert(notification).values({
            receiverType: ADMIN_USER_TYPE,
            receiverId: auth.admin!.id,
            type: "BACKUP_CREATED",
            title: "备份已完成",
            content: `备份 ${result.backupId} 已创建成功。`,
        });

        return json({ backupId: result.backupId, createdAt: result.createdAt, sqlPath: result.sqlPath, zipPath: result.zipPath });
    },
};

const backupRestoreRoutes: RouteDefinition = {
    async POST(req: Request) {
        const auth = await requireAdminAuth(req);
        if (auth.error) return auth.error;

        const body = await parseBody<{ backupId?: string; password?: string; confirmPassword?: string }>(req);
        const backupId = body.backupId?.trim();
        const password = body.password ?? "";
        const confirmPassword = body.confirmPassword ?? "";
        const sessionToken = getCookieValue(req, ADMIN_SESSION_COOKIE) ?? req.headers.get("x-admin-session");

        if (!backupId) {
            return error("缺少备份ID", "VALIDATION_ERROR");
        }

        if (!password || !confirmPassword) {
            return error("请输入管理员密码确认", "VALIDATION_ERROR");
        }

        if (password !== confirmPassword) {
            return error("两次输入的密码不一致", "VALIDATION_ERROR");
        }

        const [adm] = await db.select().from(admin).where(eq(admin.id, auth.admin!.id));
        if (!adm) {
            return error("账户不存在", "ACCOUNT_NOT_FOUND", 401);
        }

        const passwordValid = await Bun.password.verify(password, adm.password);
        if (!passwordValid) {
            return error("管理员密码不正确", "INVALID_CREDENTIALS", 401);
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(backupId)) {
            return error("备份ID格式不合法", "INVALID_ID");
        }

        const backupDir = join(process.cwd(), "backups");
        const sqlPath = join(backupDir, `${backupId}.sql`);
        const zipPath = join(backupDir, `${backupId}.zip`);

        try {
            await access(sqlPath);
            await access(zipPath);
        } catch {
            return error("备份文件不存在", "BACKUP_NOT_FOUND", 404);
        }

        const dbHost = process.env.DB_HOST || "localhost";
        const dbUser = process.env.DB_USER || "root";
        const dbPassword = process.env.DB_PASSWORD || "root";
        const dbName = process.env.DB_NAME || "sampling_simulation";

        const preBackup = await createBackupArtifacts("pre_restore");
        if (!preBackup.ok) {
            return error(preBackup.error, preBackup.code, 500);
        }

        const resetProcess = Bun.spawn({
            cmd: ["mariadb", "-h", dbHost, "-u", dbUser, "-e", `DROP DATABASE IF EXISTS \`${dbName}\`; CREATE DATABASE \`${dbName}\`;`],
            env: { ...process.env, MYSQL_PWD: dbPassword },
            stdout: "ignore",
            stderr: "pipe",
        });

        const resetExit = await resetProcess.exited;
        if (resetExit !== 0) {
            const errorText = await new Response(resetProcess.stderr).text();
            return error(`数据库清空失败: ${errorText || "未知错误"}`, "DB_RESET_FAILED", 500);
        }

        const sqlFile = Bun.file(sqlPath);
        const restoreProcess = Bun.spawn({
            cmd: ["mariadb", "-h", dbHost, "-u", dbUser, dbName],
            env: { ...process.env, MYSQL_PWD: dbPassword },
            stdin: sqlFile,
            stdout: "ignore",
            stderr: "pipe",
        });

        const restoreExit = await restoreProcess.exited;
        if (restoreExit !== 0) {
            const errorText = await new Response(restoreProcess.stderr).text();
            return error(`数据库恢复失败: ${errorText || "未知错误"}`, "DB_RESTORE_FAILED", 500);
        }

        const unzipProcess = Bun.spawn({
            cmd: ["unzip", "-o", zipPath, "-d", process.cwd()],
            stdout: "ignore",
            stderr: "pipe",
        });

        const unzipExit = await unzipProcess.exited;
        if (unzipExit !== 0) {
            const errorText = await new Response(unzipProcess.stderr).text();
            return error(`文件恢复失败: ${errorText || "未知错误"}`, "PUBLIC_RESTORE_FAILED", 500);
        }

        await db.insert(operationLog).values({
            userType: ADMIN_USER_TYPE,
            userId: auth.admin!.id,
            action: "RESTORE_BACKUP",
            targetType: "system",
            detail: {
                backupId,
                preRestoreBackupId: preBackup.backupId,
                preRestoreSqlPath: preBackup.sqlPath,
                preRestoreZipPath: preBackup.zipPath,
            },
            ipAddress: getClientIp(req),
        });

        if (sessionToken) {
            await db.delete(userSession).where(eq(userSession.sessionToken, sessionToken));
        }

        const secure = isSecureRequest(req);
        return json({ success: true, restoredFrom: backupId }, 200, { "Set-Cookie": clearSessionCookie(ADMIN_SESSION_COOKIE, secure) });
    },
};

const backupListRoutes: RouteDefinition = {
    async GET() {
        const backupDir = join(process.cwd(), "backups");
        try {
            const entries = await readdir(backupDir);
            const sqlFiles = entries.filter((file) => extname(file) === ".sql");
            const items = await Promise.all(
                sqlFiles.map(async (file) => {
                    const backupId = file.replace(/\.sql$/, "");
                    const sqlPath = join(backupDir, `${backupId}.sql`);
                    const zipPath = join(backupDir, `${backupId}.zip`);
                    let hasZip = false;
                    try {
                        await access(zipPath);
                        hasZip = true;
                    } catch {
                        hasZip = false;
                    }
                    const fileStat = await stat(sqlPath);
                    return {
                        backupId,
                        createdAt: fileStat.mtime.toISOString(),
                        sqlPath,
                        zipPath,
                        hasZip,
                    };
                })
            );

            items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            return json(items);
        } catch {
            return json([] as Array<{ backupId: string; createdAt: string; sqlPath: string; zipPath: string; hasZip: boolean }>);
        }
    },
};

export { backupCreateRoutes, backupListRoutes, backupRestoreRoutes };
