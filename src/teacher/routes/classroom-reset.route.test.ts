import { expect, mock, test } from "bun:test";
import { student } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withId(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

test("student password reset restores the student ID password and clears sessions", async () => {
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
    const password = (update?.set as any).password as string;
    expect(update?.set).toMatchObject({ password: expect.any(String), updatedAt: expect.any(Date) });
    expect(operations.filter((operation) => operation.kind === "delete")).toHaveLength(1);
    expect(password).toStartWith("$argon2id$");
    expect(await Bun.password.verify("2024002", password)).toBe(true);
});
