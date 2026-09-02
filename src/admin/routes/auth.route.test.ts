import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("admin password change revokes all old sessions and rotates the cookie", async () => {
    const currentPassword = "Teaching123!";
    const { db, operations } = createMockDb({ select: [
        [{ id: 5, sessionToken: "admin-current", userType: 1, userId: 3, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }],
        [{ id: 3, username: "admin" }],
        [{ id: 3, username: "admin", password: await Bun.password.hash(currentPassword) }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?admin-password=${crypto.randomUUID()}`);
    const route = module.withAdminAuth(module.adminPasswordRoutes).PUT!;
    const response = await route(new Request("https://example.com/api/admin/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: "admin_session=admin-current" },
        body: JSON.stringify({ currentPassword, newPassword: "Different456!" }),
    }));

    expect(response.status).toBe(200);
    expect(operations.find((item) => item.kind === "update")?.set).toMatchObject({
        password: expect.any(String),
        updatedAt: expect.any(Date),
    });
    expect(operations.filter((item) => item.kind === "delete")).toHaveLength(2);
    expect(operations.filter((item) => item.kind === "insert")).toHaveLength(1);
    expect(response.headers.get("set-cookie")).toContain("admin_session=");
});

test("admin sessions can access protected routes without a first-login gate", async () => {
    const session = (token: string) => ({
        id: 5,
        sessionToken: token,
        userType: 1,
        userId: 3,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
    });
    const { db } = createMockDb({ select: [
        [session("admin-session")],
        [{ id: 3, username: "admin" }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?admin-gate=${crypto.randomUUID()}`);
    const handler = mock(() => Response.json({ ok: true }));
    const route = module.withAdminAuth({ GET: handler }).GET!;

    const response = await route(new Request("https://example.com/api/admin/stats", {
        headers: { cookie: "admin_session=admin-session" },
    }));
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
});

test("wrong admin passwords never create lockout state", async () => {
    const row = {
        id: 3,
        username: "admin",
        password: await Bun.password.hash("Admin!2026"),
    };
    const { db, operations } = createMockDb({ select: Array.from({ length: 6 }, () => [row]) });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?admin-locked=${crypto.randomUUID()}`);
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await module.adminLoginRoutes.POST!(new Request("https://example.com/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "admin", password: "wrong" }),
        }));
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({
            error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" },
        });
    }
    expect(operations.some((item) => item.kind === "update")).toBe(false);
});
