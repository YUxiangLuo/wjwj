import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("admin password change revokes every other session", async () => {
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
    expect(operations.some((item) => item.kind === "update")).toBe(true);
    expect(operations.filter((item) => item.kind === "delete")).toHaveLength(1);
});
