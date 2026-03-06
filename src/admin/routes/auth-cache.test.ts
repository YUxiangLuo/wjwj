import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

async function loadAdminAuthModule(options: {
    select?: unknown[];
    update?: unknown[];
    config?: Record<string, number>;
} = {}) {
    const { db, operations } = createMockDb(options);
    const config = options.config ?? {};

    mock.module("../../db", () => ({ db }));
    mock.module("../../server/system-config", () => ({
        getConfigNumber: async (key: string, fallback: number) => config[key] ?? fallback,
    }));

    const module = await import(`./auth?admin-auth-cache-test=${Math.random()}`);
    return { module, operations };
}

test("admin auth cache avoids duplicate DB work on repeated auth checks for one request", async () => {
    const { module, operations } = await loadAdminAuthModule({
        select: [
            [{
                id: 6,
                sessionToken: "admin-session",
                userType: 1,
                userId: 3,
                expiresAt: new Date(Date.now() + 60_000),
            }],
            [{
                id: 3,
                username: "admin",
                isFirstLogin: 0,
            }],
        ],
        config: {
            "session.admin_timeout_minutes": 30,
        },
    });

    const request = new Request("https://example.com/api/admin/stats", {
        headers: { cookie: "admin_session=admin-session" },
    });
    const firstAuth = await module.requireAdminAuth(request);
    const secondAuth = await module.requireAdminAuth(request);

    expect(firstAuth.error).toBeNull();
    expect(firstAuth.admin).toMatchObject({ id: 3, username: "admin" });
    expect(secondAuth.error).toBeNull();
    expect(secondAuth.admin).toMatchObject({ id: 3, username: "admin" });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(2);
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(1);
});

test("withAdminAuth injects admin auth context for wrapped handlers", async () => {
    const { module, operations } = await loadAdminAuthModule({
        select: [
            [{
                id: 6,
                sessionToken: "admin-session",
                userType: 1,
                userId: 3,
                expiresAt: new Date(Date.now() + 60_000),
            }],
            [{
                id: 3,
                username: "admin",
                isFirstLogin: 0,
            }],
        ],
        config: {
            "session.admin_timeout_minutes": 30,
        },
    });

    const routes = module.withAdminAuth({
        async GET(req: Request) {
            const auth = module.getAdminAuth(req);
            return Response.json({
                adminId: auth.admin?.id,
                username: auth.admin?.username,
                sessionExpiresAt: auth.session?.expiresAt ?? null,
            });
        },
    });

    const request = new Request("https://example.com/api/admin/stats", {
        headers: { cookie: "admin_session=admin-session" },
    });
    const response = await routes.GET!(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ adminId: 3, username: "admin" });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(2);
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(1);
});
