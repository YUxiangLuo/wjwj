import { expect, mock, test } from "bun:test";
import { createMockDb } from "../test-utils/mock-db";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

for (const role of ["student", "teacher", "admin"] as const) {
    const accountField = role === "student" ? "studentId" : role === "teacher" ? "employeeId" : "username";
    const userType = role === "student" ? 3 : role === "teacher" ? 2 : 1;
    test(`${role} login refuses issuance when the verified account no longer matches`, async () => {
        const password = "Teaching123!";
        const row = { id: 11, [accountField]: "ACCOUNT", name: "测试", classId: 1, status: 1, password: await Bun.password.hash(password) };
        const { db, operations } = createMockDb({ select: [[row], []] });
        mock.module("../db", () => ({ db }));
        const module = await import(`../${role}/routes/auth.ts?issue-race=${crypto.randomUUID()}`);
        const route = role === "student" ? module.loginRoutes : role === "teacher" ? module.teacherLoginRoutes : module.adminLoginRoutes;
        const response = await route.POST(new Request("https://example.com/login", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [accountField]: "ACCOUNT", password }),
        }));
        expect(response.status).toBe(401);
        expect(response.headers.has("set-cookie")).toBe(false);
        expect(operations.some(operation => operation.kind === "insert")).toBe(false);
        const guarded = operations.filter(operation => operation.kind === "select")[1]!;
        const query = new PgDialect().sqlToQuery(guarded.where as SQL).sql;
        expect(query).toContain(`"${role}"."password"`);
        if (role !== "admin") expect(query).toContain(`"${role}"."status"`);
        expect(operations.some(operation => operation.kind === "transaction")).toBe(true);
    });

    test(`${role} password rotation refuses a concurrent reset or disable`, async () => {
        const password = "Teaching123!";
        const row = { id: 11, [accountField]: "ACCOUNT", name: "测试", classId: 1, status: 1, password: await Bun.password.hash(password) };
        const { db, operations } = createMockDb({ select: [
            [{ sessionToken: "token", userType, userId: 11, expiresAt: new Date(Date.now() + 60_000) }], [row], [row],
        ], update: [[]] });
        mock.module("../db", () => ({ db }));
        const module = await import(`../${role}/routes/auth.ts?rotate-race=${crypto.randomUUID()}`);
        const route = role === "student" ? module.passwordRoutes : role === "teacher"
            ? module.withTeacherAuth(module.teacherPasswordRoutes) : module.withAdminAuth(module.adminPasswordRoutes);
        const response = await route.PUT(new Request("https://example.com/password", {
            method: "PUT", headers: { "Content-Type": "application/json", cookie: `${role}_session=token` },
            body: JSON.stringify({ currentPassword: password, newPassword: "Different456!" }),
        }));
        expect(response.status).toBe(401);
        expect(operations.some(operation => operation.kind === "insert")).toBe(false);
        expect(operations.some(operation => operation.kind === "delete")).toBe(false);
    });
}
