import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("teacher password change revokes all old sessions and rotates the cookie", async () => {
    const currentPassword = "Teaching123!";
    const { db, operations } = createMockDb({ select: [
        [{ id: 5, sessionToken: "teacher-current", userType: 2, userId: 9, createdAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }],
        [{ id: 9, employeeId: "T001", name: "教师一", status: 1 }],
        [{ id: 9, employeeId: "T001", password: await Bun.password.hash(currentPassword) }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?teacher-password=${crypto.randomUUID()}`);
    const route = module.withTeacherAuth(module.teacherPasswordRoutes).PUT!;
    const response = await route(new Request("https://example.com/api/teacher/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", cookie: "teacher_session=teacher-current" },
        body: JSON.stringify({ currentPassword, newPassword: "Different456!" }),
    }));

    expect(response.status).toBe(200);
    const update = operations.find((item) => item.kind === "update");
    expect(update?.set).toMatchObject({ password: expect.any(String), updatedAt: expect.any(Date) });
    expect(operations.filter((item) => item.kind === "delete")).toHaveLength(2);
    expect(operations.filter((item) => item.kind === "insert")).toHaveLength(1);
    expect(response.headers.get("set-cookie")).toContain("teacher_session=");
});

test("wrong teacher passwords never create lockout state", async () => {
    const row = {
        id: 9,
        employeeId: "T001",
        name: "教师一",
        status: 1,
        password: await Bun.password.hash("T001"),
    };
    const { db, operations } = createMockDb({ select: Array.from({ length: 6 }, () => [row]) });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?teacher-lockout=${crypto.randomUUID()}`);
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await module.teacherLoginRoutes.POST!(new Request("https://example.com/api/teacher/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId: "T001", password: "wrong" }),
        }));
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({
            error: { code: "INVALID_CREDENTIALS", message: "工号或密码错误" },
        });
    }
    expect(operations.some((item) => item.kind === "update")).toBe(false);
});

test("teacher sessions can access protected routes without a first-login gate", async () => {
    const session = (token: string) => ({
        id: 5,
        sessionToken: token,
        userType: 2,
        userId: 9,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
    });
    const { db } = createMockDb({ select: [
        [session("teacher-session")],
        [{ id: 9, employeeId: "T001", name: "教师一", status: 1 }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./auth.ts?teacher-gate=${crypto.randomUUID()}`);
    const handler = mock(() => Response.json({ ok: true }));
    const route = module.withTeacherAuth({ GET: handler }).GET!;

    const response = await route(new Request("https://example.com/api/teacher/dashboard", {
        headers: { cookie: "teacher_session=teacher-session" },
    }));
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
});
