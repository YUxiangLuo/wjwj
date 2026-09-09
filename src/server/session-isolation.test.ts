import { expect, mock, test } from "bun:test";
import { createMockDb } from "../test-utils/mock-db";

for (const role of ["student", "teacher", "admin"] as const) {
    for (const action of ["password", "logout"] as const) {
        test(`${role} ${action} rejects a stale page identity without writes or Set-Cookie`, async () => {
            const userType = role === "student" ? 3 : role === "teacher" ? 2 : 1;
            const { db, operations } = createMockDb({ select: [[{
                sessionToken: "new-account-token", userType, userId: 22, expiresAt: new Date(Date.now() + 60_000),
            }]] });
            mock.module("../db", () => ({ db }));
            const module = await import(`../${role}/routes/auth.ts?isolation=${crypto.randomUUID()}`);
            const route = action === "logout"
                ? role === "student" ? module.logoutRoutes : role === "teacher" ? module.teacherLogoutRoutes : module.adminLogoutRoutes
                : role === "student" ? module.passwordRoutes : role === "teacher" ? module.withTeacherAuth(module.teacherPasswordRoutes) : module.withAdminAuth(module.adminPasswordRoutes);
            const method = action === "logout" ? "POST" : "PUT";
            const response = await route[method](new Request(`https://example.com/api/${role}/${action}`, {
                method, headers: { cookie: `${role}_session=new-account-token`, "X-Expected-User-Id": "11" },
            }));
            expect(response.status).toBe(409);
            expect(await response.json()).toMatchObject({ error: { code: "SESSION_CHANGED" } });
            expect(response.headers.has("set-cookie")).toBe(false);
            expect(operations.every(op => op.kind === "select")).toBe(true);
        });
    }
}
