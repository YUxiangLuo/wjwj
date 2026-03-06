import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function createJsonRequest(url: string, method: string, body?: unknown, headers?: HeadersInit) {
    return new Request(url, {
        method,
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

async function loadBackupRoutes(options: {
    backupResult?: unknown;
    authResult?: unknown;
    select?: unknown[];
    insert?: unknown[];
    update?: unknown[];
    delete?: unknown[];
} = {}) {
    const { db, operations } = createMockDb(options);
    const authResult = options.authResult ?? { admin: { id: 1 }, error: null };
    const backupResult = options.backupResult ?? {
        ok: true,
        backupId: "backup_2026",
        createdAt: new Date().toISOString(),
        sqlPath: "backups/backup_2026.sql",
        zipPath: "backups/backup_2026.zip",
    };

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        ADMIN_SESSION_COOKIE: "admin_session",
        ADMIN_USER_TYPE: 1,
        getAdminAuth: () => authResult,
        getAdminUser: () => (authResult as any).admin ?? { id: 1, username: "admin", isFirstLogin: 0 },
        requireAdminAuth: async () => authResult,
    }));
    mock.module("../backup", () => ({
        createBackupArtifacts: async () => backupResult,
    }));

    const module = await import("./backup");
    return { module, operations };
}

test("backup create returns 500 and notifies current admin when artifact generation fails", async () => {
    const { module, operations } = await loadBackupRoutes({
        backupResult: {
            ok: false,
            error: "数据库备份失败: mock failure",
            code: "DB_BACKUP_FAILED",
        },
    });

    const response = await module.backupCreateRoutes.POST!(createJsonRequest(
        "https://example.com/api/admin/backups",
        "POST"
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(500);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "DB_BACKUP_FAILED",
            message: "数据库备份失败: mock failure",
        },
    });

    const notificationInsert = operations.find((operation) => operation.kind === "insert");
    expect(notificationInsert?.values).toMatchObject({
        receiverType: 1,
        receiverId: 1,
        type: "BACKUP_FAILED",
        title: "备份失败",
    });
});

test("backup create writes operation log and success notification on success", async () => {
    const { module, operations } = await loadBackupRoutes({
        backupResult: {
            ok: true,
            backupId: "backup_2026",
            createdAt: "2026-03-06T00:00:00.000Z",
            sqlPath: "backups/backup_2026.sql",
            zipPath: "backups/backup_2026.zip",
        },
    });

    const response = await module.backupCreateRoutes.POST!(createJsonRequest(
        "https://example.com/api/admin/backups",
        "POST",
        undefined,
        { "x-real-ip": "127.0.0.1" }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data).toMatchObject({
        backupId: "backup_2026",
        sqlPath: "backups/backup_2026.sql",
        zipPath: "backups/backup_2026.zip",
    });

    const operationLogInsert = operations.find((operation) => operation.kind === "insert" && (operation.values as any)?.action === "CREATE_BACKUP");
    expect(operationLogInsert?.values).toMatchObject({
        userType: 1,
        userId: 1,
        action: "CREATE_BACKUP",
        ipAddress: "127.0.0.1",
    });

    const notificationInsert = operations.find((operation) => operation.kind === "insert" && (operation.values as any)?.type === "BACKUP_CREATED");
    expect(notificationInsert?.values).toMatchObject({
        receiverType: 1,
        receiverId: 1,
        type: "BACKUP_CREATED",
        title: "备份已完成",
    });
});

test("backup restore rejects mismatched confirmation password before touching the database", async () => {
    const { module, operations } = await loadBackupRoutes();
    const response = await module.backupRestoreRoutes.POST!(createJsonRequest(
        "https://example.com/api/admin/backups/restore",
        "POST",
        {
            backupId: "backup_2026",
            password: "Admin@2026",
            confirmPassword: "Admin@2027",
        }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "两次输入的密码不一致",
        },
    });
    expect(operations).toHaveLength(0);
});
