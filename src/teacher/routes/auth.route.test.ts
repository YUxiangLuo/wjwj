import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("teacher password change revokes every other session", async () => {
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
    expect(operations.some((item) => item.kind === "update")).toBe(true);
    expect(operations.filter((item) => item.kind === "delete")).toHaveLength(1);
});
