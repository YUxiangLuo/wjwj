import { expect, mock, test } from "bun:test";
import { student } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withId(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

test("student password reset requires a password change and clears sessions", async () => {
    const { db, operations } = createMockDb({ select: [[{ id: 12, studentId: "2024002", status: 1 }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./classroom.ts?reset=${Date.now()}`);

    const response = await module.studentRoutes.PUT!(withId(new Request("https://example.com/api/teacher/students/12", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset_password" }),
    }), "12"));

    expect(response.status).toBe(200);
    const update = operations.find((operation) => operation.kind === "update" && operation.table === student);
    expect(update?.set).toMatchObject({ password: expect.any(String), isFirstLogin: 1, updatedAt: expect.any(Date) });
    expect(update?.set).not.toHaveProperty("loginFailCount");
    expect(operations.filter((operation) => operation.kind === "delete")).toHaveLength(1);
});
