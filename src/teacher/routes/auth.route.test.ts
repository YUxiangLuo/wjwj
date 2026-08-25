import { expect, mock, test } from "bun:test";
import { SQL } from "drizzle-orm";
import { createMockDb } from "../../test-utils/mock-db";

test("teacher password change revokes every other session", async () => {
    const currentPassword = "Teaching123!";
    const { db, operations } = createMockDb({ select: [
        [{ id: 5, sessionToken: "teacher-current", userType: 2, userId: 9, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }],
        [{ id: 9, employeeId: "T001", name: "教师一", status: 1, isFirstLogin: 1 }],
        [{ id: 9, employeeId: "T001", password: await Bun.password.hash(currentPassword) }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?teacher-password=${crypto.randomUUID()}`);
    const route = module.withTeacherAuth(module.teacherPasswordRoutes, { allowFirstLogin: true }).PUT!;
    const response = await route(new Request("https://example.com/api/teacher/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: "teacher_session=teacher-current" },
        body: JSON.stringify({ currentPassword, newPassword: "Different456!" }),
    }));

    expect(response.status).toBe(200);
    const update = operations.find((item) => item.kind === "update");
    expect(update?.set).toMatchObject({ password: expect.any(String), isFirstLogin: 0, loginFailCount: 0, lockedUntil: null, updatedAt: expect.any(Date) });
    expect(operations.filter((item) => item.kind === "delete")).toHaveLength(1);
});

test("fifth failed teacher login locks the account", async () => {
    const { db, operations } = createMockDb({ select: [[{
        id: 9,
        employeeId: "T001",
        name: "教师一",
        status: 1,
        password: await Bun.password.hash("Teaching123!"),
        isFirstLogin: 0,
        loginFailCount: 4,
        lockedUntil: null,
    }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?teacher-lockout=${crypto.randomUUID()}`);
    const response = await module.teacherLoginRoutes.POST!(new Request("https://example.com/api/teacher/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: "T001", password: "wrong" }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
        error: { code: "INVALID_CREDENTIALS", message: "工号或密码错误" },
    });
    expect(operations.find((item) => item.kind === "update")?.set).toMatchObject({
        loginFailCount: expect.any(SQL),
        lockedUntil: expect.any(SQL),
    });
});

test("locked teacher login verifies credentials but preserves the lock and rejects", async () => {
    const password = "Teaching123!";
    const { db, operations } = createMockDb({ select: [[{
        id: 9,
        employeeId: "T001",
        name: "教师一",
        status: 1,
        password: await Bun.password.hash(password),
        isFirstLogin: 0,
        loginFailCount: 5,
        lockedUntil: new Date(Date.now() + 60_000),
    }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?teacher-locked=${crypto.randomUUID()}`);
    const response = await module.teacherLoginRoutes.POST!(new Request("https://example.com/api/teacher/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: "T001", password }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
        error: { code: "INVALID_CREDENTIALS", message: "工号或密码错误" },
    });
    expect(operations.some((item) => item.kind === "update")).toBe(false);
});

test("teacher protected routes stay locked until the first-login flag is cleared", async () => {
    const session = (token: string) => ({
        id: 5,
        sessionToken: token,
        userType: 2,
        userId: 9,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
    });
    const { db } = createMockDb({ select: [
        [session("teacher-first")],
        [{ id: 9, employeeId: "T001", name: "教师一", status: 1, isFirstLogin: 1 }],
        [session("teacher-changed")],
        [{ id: 9, employeeId: "T001", name: "教师一", status: 1, isFirstLogin: 0 }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?teacher-gate=${crypto.randomUUID()}`);
    const handler = mock(() => Response.json({ ok: true }));
    const route = module.withTeacherAuth({ GET: handler }).GET!;

    const locked = await route(new Request("https://example.com/api/teacher/dashboard", {
        headers: { cookie: "teacher_session=teacher-first" },
    }));
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ error: { code: "PASSWORD_CHANGE_REQUIRED" } });
    expect(handler).not.toHaveBeenCalled();

    const unlocked = await route(new Request("https://example.com/api/teacher/dashboard", {
        headers: { cookie: "teacher_session=teacher-changed" },
    }));
    expect(unlocked.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
});
