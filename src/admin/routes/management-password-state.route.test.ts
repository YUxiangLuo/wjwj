import { expect, mock, test } from "bun:test";
import { student, teacher } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

function withId(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

test("admin-created and reset accounts use their identifier as the password", async () => {
    const { db, operations } = createMockDb({
        select: [
            [],
            [{ id: 21, employeeId: "T021", name: "教师二十一" }],
            [{ id: 31, studentId: "S031", name: "学生三十一" }],
        ],
        insert: [[{ id: 21 }]],
    });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?password-state=${crypto.randomUUID()}`);

    const created = await module.teacherRoutes.POST!(new Request("https://example.com/api/admin/teachers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ employeeId: "T021", name: "教师二十一" }),
    }));
    expect(created.status).toBe(201);

    const teacherReset = await module.teacherResetPasswordRoutes.POST!(withId(
        new Request("https://example.com/api/admin/teachers/21/reset-password", { method: "POST" }),
        "21",
    ));
    expect(teacherReset.status).toBe(200);

    const studentReset = await module.studentResetPasswordRoutes.POST!(withId(
        new Request("https://example.com/api/admin/students/31/reset-password", { method: "POST" }),
        "31",
    ));
    expect(studentReset.status).toBe(200);

    const teacherInsert = operations.find((operation) => operation.kind === "insert" && operation.table === teacher);
    const teacherInsertPassword = (teacherInsert?.values as any).password as string;
    expect(teacherInsert?.values).toMatchObject({
        employeeId: "T021",
        password: expect.any(String),
    });

    const teacherUpdate = operations.find((operation) => operation.kind === "update" && operation.table === teacher);
    const teacherResetPassword = (teacherUpdate?.set as any).password as string;
    expect(teacherUpdate?.set).toMatchObject({
        password: expect.any(String),
        updatedAt: expect.any(Date),
    });

    const studentUpdate = operations.find((operation) => operation.kind === "update" && operation.table === student);
    const studentResetPassword = (studentUpdate?.set as any).password as string;
    expect(studentUpdate?.set).toMatchObject({
        password: expect.any(String),
        updatedAt: expect.any(Date),
    });
    expect(teacherInsertPassword).toStartWith("$argon2id$");
    expect(teacherResetPassword).toStartWith("$argon2id$");
    expect(studentResetPassword).toStartWith("$argon2id$");
    expect(await Bun.password.verify("T021", teacherInsertPassword)).toBe(true);
    expect(await Bun.password.verify("T021", teacherResetPassword)).toBe(true);
    expect(await Bun.password.verify("S031", studentResetPassword)).toBe(true);
    expect(operations.filter((operation) => operation.kind === "delete")).toHaveLength(2);
});
