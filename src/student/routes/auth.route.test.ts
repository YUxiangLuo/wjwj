import { expect, mock, test } from "bun:test";
import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createMockDb } from "../../test-utils/mock-db";

function request(method: string, body?: unknown, cookie?: string) {
    return new Request("https://example.com", {
        method,
        headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
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
    expect(await response.json()).toMatchObject({ data: { user: { studentId: "S001" } } });
    const session = operations.find((item) => item.kind === "insert");
    expect(session?.values).toMatchObject({ userType: 3, userId: 11, expiresAt: expect.any(Date) });
    expect(session?.values).not.toHaveProperty("deviceInfo");
});

test("student login rejects non-string fields before querying", async () => {
    for (const body of [
        { studentId: 123, password: "wrong" },
        { studentId: "S001", password: 123 },
    ]) {
        const { module, operations } = await load();
        const response = await module.loginRoutes.POST!(request("POST", body));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
        expect(operations).toHaveLength(0);
    }
});

test("wrong student passwords never create lockout state", async () => {
    const row = {
        id: 11, studentId: "S001", name: "学生一", classId: 7, status: 1,
        deletedAt: null, password: await Bun.password.hash("S001"),
    };
    const { module, operations } = await load(Array.from({ length: 6 }, () => [row]));
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await module.loginRoutes.POST!(request("POST", { studentId: "S001", password: "wrong" }));
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({
            error: { code: "INVALID_CREDENTIALS", message: "账号或密码错误" },
        });
    }
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
    expect(await response.json()).toMatchObject({
        data: { studentId: "S001", className: "统计一班" },
    });
    expect(operations.some((item) => item.kind === "update")).toBe(false);
});

test("student logout removes only the current session and clears the cookie", async () => {
    const { module, operations } = await load();
    const response = await module.logoutRoutes.POST!(request("POST", undefined, "student_session=token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(operations.some((item) => item.kind === "delete")).toBe(true);
});

test("student password change revokes all old sessions and rotates the cookie", async () => {
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
    const update = operations.find((item) => item.kind === "update");
    expect(update?.set).toMatchObject({ password: expect.any(String), updatedAt: expect.any(Date) });
    const deletions = operations.filter((item) => item.kind === "delete");
    expect(deletions).toHaveLength(2);
    expect(operations.filter((item) => item.kind === "insert")).toHaveLength(1);
    expect(response.headers.get("set-cookie")).toContain("student_session=");
    const revokeQuery = new PgDialect().sqlToQuery(deletions[0]!.where as SQL);
    expect(revokeQuery.sql).not.toContain("session_token\" <>");
    expect(revokeQuery.params).toEqual([3, 11]);
});

test("student sessions can access protected routes without a first-login gate", async () => {
    const session = (token: string) => ({
        id: 5,
        sessionToken: token,
        userType: 3,
        userId: 11,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
    });
    const { module } = await load([
        [session("student-session")],
        [{ id: 11, studentId: "S001", name: "学生一", classId: 7, status: 1 }],
    ]);

    const auth = await module.requireAuth(request("GET", undefined, "student_session=student-session"));
    expect(auth.error).toBeNull();
    expect(auth.student).toMatchObject({ studentId: "S001" });
});
