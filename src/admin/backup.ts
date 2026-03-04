import { mkdir } from "node:fs/promises";
import { join } from "node:path";

type BackupResult =
    | { ok: true; backupId: string; createdAt: string; sqlPath: string; zipPath: string }
    | { ok: false; error: string; code: string };

function requireEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export async function createBackupArtifacts(prefix = "backup"): Promise<BackupResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupId = `${prefix}_${timestamp}`;
    const createdAt = new Date().toISOString();

    const backupDir = join(process.cwd(), "backups");
    await mkdir(backupDir, { recursive: true });

    const dbHost = requireEnv("DB_HOST");
    const dbUser = requireEnv("DB_USER");
    const dbPassword = requireEnv("DB_PASSWORD");
    const dbName = requireEnv("DB_NAME");

    const sqlPath = join(backupDir, `${backupId}.sql`);
    const zipPath = join(backupDir, `${backupId}.zip`);

    const dumpProcess = Bun.spawn({
        cmd: ["mariadb-dump", "-h", dbHost, "-u", dbUser, dbName, "--result-file", sqlPath],
        env: { ...process.env, MYSQL_PWD: dbPassword },
        stdout: "ignore",
        stderr: "pipe",
    });

    const dumpExit = await dumpProcess.exited;
    if (dumpExit !== 0) {
        const errorText = await new Response(dumpProcess.stderr).text();
        return { ok: false, error: `数据库备份失败: ${errorText || "未知错误"}`, code: "DB_BACKUP_FAILED" };
    }

    const zipProcess = Bun.spawn({
        cmd: ["zip", "-r", zipPath, "public"],
        cwd: process.cwd(),
        stdout: "ignore",
        stderr: "pipe",
    });

    const zipExit = await zipProcess.exited;
    if (zipExit !== 0) {
        const errorText = await new Response(zipProcess.stderr).text();
        return { ok: false, error: `文件打包失败: ${errorText || "未知错误"}`, code: "PUBLIC_BACKUP_FAILED" };
    }

    return { ok: true, backupId, createdAt, sqlPath, zipPath };
}
