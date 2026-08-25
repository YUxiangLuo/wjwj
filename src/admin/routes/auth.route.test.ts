import { expect, mock, test } from "bun:test";
import { SQL } from "drizzle-orm";
import { createMockDb } from "../../test-utils/mock-db";

test("admin password change revokes every other session", async () => {
    const currentPassword = "Teaching123!";
    const { db, operations } = createMockDb({ select: [
        [{ id: 5, sessionToken: "admin-current", userType: 1, userId: 3, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }],
        [{ id: 3, username: "admin", isFirstLogin: 1 }],
        [{ id: 3, username: "admin", password: await Bun.password.hash(currentPassword) }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?admin-password=${crypto.randomUUID()}`);
    const route = module.withAdminAuth(module.adminPasswordRoutes, { allowFirstLogin: true }).PUT!;
    const response = await route(new Request("https://example.com/api/admin/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: "admin_session=admin-current" },
        body: JSON.stringify({ currentPassword, newPassword: "Different456!" }),
    }));

    expect(response.status).toBe(200);
    expect(operations.find((item) => item.kind === "update")?.set).toMatchObject({
        password: expect.any(String),
        isFirstLogin: 0,
        loginFailCount: 0,
        lockedUntil: null,
    });
    expect(operations.filter((item) => item.kind === "delete")).toHaveLength(1);
});

test("admin protected routes require the initial password to be changed", async () => {
    const session = (token: string) => ({
        id: 5,
        sessionToken: token,
        userType: 1,
        userId: 3,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
    });
    const { db } = createMockDb({ select: [
        [session("admin-first")],
        [{ id: 3, username: "admin", isFirstLogin: 1 }],
        [session("admin-changed")],
        [{ id: 3, username: "admin", isFirstLogin: 0 }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?admin-gate=${crypto.randomUUID()}`);
    const handler = mock(() => Response.json({ ok: true }));
    const route = module.withAdminAuth({ GET: handler }).GET!;

    const locked = await route(new Request("https://example.com/api/admin/stats", {
        headers: { cookie: "admin_session=admin-first" },
    }));
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ error: { code: "PASSWORD_CHANGE_REQUIRED" } });
    expect(handler).not.toHaveBeenCalled();

    const unlocked = await route(new Request("https://example.com/api/admin/stats", {
        headers: { cookie: "admin_session=admin-changed" },
    }));
    expect(unlocked.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
});

test("locked admin login verifies credentials but preserves the lock and rejects", async () => {
    const password = "Teaching123!";
    const { db, operations } = createMockDb({ select: [[{
        id: 3,
        username: "admin",
        password: await Bun.password.hash(password),
        isFirstLogin: 0,
        loginFailCount: 5,
        lockedUntil: new Date(Date.now() + 60_000),
    }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?admin-locked=${crypto.randomUUID()}`);
    const response = await module.adminLoginRoutes.POST!(new Request("https://example.com/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
        error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" },
    });
    expect(operations.some((item) => item.kind === "update")).toBe(false);
});

test("fifth failed admin login locks the account", async () => {
    const { db, operations } = createMockDb({ select: [[{
        id: 3,
        username: "admin",
        password: await Bun.password.hash("Teaching123!"),
        isFirstLogin: 1,
        loginFailCount: 4,
        lockedUntil: null,
    }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?admin-lockout=${crypto.randomUUID()}`);
    const response = await module.adminLoginRoutes.POST!(new Request("https://example.com/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong" }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
        error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" },
    });
    expect(operations.find((item) => item.kind === "update")?.set).toMatchObject({
        loginFailCount: expect.any(SQL),
        lockedUntil: expect.any(SQL),
    });
});
