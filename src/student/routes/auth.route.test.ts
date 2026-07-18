import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createMockDb } from "../../test-utils/mock-db";

function request(method: string, body?: unknown, cookie?: string) {
    return new Request("https://example.com", {
        method,
        headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
}

async function load(select: unknown[] = []) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?auth=${crypto.randomUUID()}`);
    return { module, operations };
}

test("student login creates an independent fixed session", async () => {
    const password = "Teaching123!";
    const { module, operations } = await load([[{
        id: 11, studentId: "S001", name: "学生一", classId: 7, status: 1,
        deletedAt: null, password: await Bun.password.hash(password),
    }]]);
    const response = await module.loginRoutes.POST!(request("POST", { studentId: "S001", password }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("student_session=");
    const session = operations.find((item) => item.kind === "insert");
    expect(session?.values).toMatchObject({ userType: 3, userId: 11, expiresAt: expect.any(Date) });
    expect(session?.values).not.toHaveProperty("deviceInfo");
});

test("wrong student password has no counters or lockout state", async () => {
    const { module, operations } = await load([[{
        id: 11, studentId: "S001", name: "学生一", classId: 7, status: 1,
        deletedAt: null, password: await Bun.password.hash("Teaching123!"),
    }]]);
    const response = await module.loginRoutes.POST!(request("POST", { studentId: "S001", password: "wrong" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS", message: "账号或密码错误" } });
    expect(operations.some((item) => item.kind === "update")).toBe(false);
});

test("student me reads the fixed session without extending it", async () => {
    const { module, operations } = await load([
        [{ id: 5, sessionToken: "token", userType: 3, userId: 11, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }],
        [{ id: 11, studentId: "S001", name: "学生一", classId: 7, status: 1 }],
        [{ className: "统计一班" }],
    ]);
    const response = await module.meRoutes.GET!(request("GET", undefined, "student_session=token"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { studentId: "S001", className: "统计一班" } });
    expect(operations.some((item) => item.kind === "update")).toBe(false);
});

test("student logout removes only the current session and clears the cookie", async () => {
    const { module, operations } = await load();
    const response = await module.logoutRoutes.POST!(request("POST", undefined, "student_session=token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(operations.some((item) => item.kind === "delete")).toBe(true);
});

test("student password change revokes other sessions while keeping the current token", async () => {
    const currentPassword = "Teaching123!";
    const { module, operations } = await load([
        [{ id: 5, sessionToken: "current-token", userType: 3, userId: 11, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }],
        [{ id: 11, studentId: "S001", name: "学生一", classId: 7, status: 1 }],
        [{ id: 11, studentId: "S001", password: await Bun.password.hash(currentPassword) }],
    ]);

    const response = await module.passwordRoutes.PUT!(request(
        "PUT",
        { currentPassword, newPassword: "Different456!" },
        "student_session=current-token",
    ));

    expect(response.status).toBe(200);
    expect(operations.some((item) => item.kind === "update")).toBe(true);
    const deletions = operations.filter((item) => item.kind === "delete");
    expect(deletions).toHaveLength(1);
    const revokeQuery = new PgDialect().sqlToQuery(deletions[0]!.where as SQL);
    expect(revokeQuery.sql).toContain("session_token\" <> $3");
    expect(revokeQuery.params).toEqual([3, 11, "current-token"]);
});
