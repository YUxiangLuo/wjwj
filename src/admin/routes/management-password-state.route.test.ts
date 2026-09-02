import { expect, mock, test } from "bun:test";
import { student, teacher } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

function withId(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

test("admin-created and reset accounts must change their default password", async () => {
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
    const teacherResetPayload = await teacherReset.json() as any;

    const studentReset = await module.studentResetPasswordRoutes.POST!(withId(
        new Request("https://example.com/api/admin/students/31/reset-password", { method: "POST" }),
        "31",
    ));
    expect(studentReset.status).toBe(200);
    const studentResetPayload = await studentReset.json() as any;

    const teacherInsert = operations.find((operation) => operation.kind === "insert" && operation.table === teacher);
    expect(teacherInsert?.values).toMatchObject({
        employeeId: "T021",
        password: expect.any(String),
        isFirstLogin: 1,
    });

    const teacherUpdate = operations.find((operation) => operation.kind === "update" && operation.table === teacher);
    expect(teacherUpdate?.set).toMatchObject({
        password: expect.any(String),
        isFirstLogin: 1,
        updatedAt: expect.any(Date),
    });

    const studentUpdate = operations.find((operation) => operation.kind === "update" && operation.table === student);
    expect(studentUpdate?.set).toMatchObject({
        password: expect.any(String),
        isFirstLogin: 1,
        updatedAt: expect.any(Date),
    });
    expect(teacherResetPayload.data.temporaryPassword).toHaveLength(12);
    expect(studentResetPayload.data.temporaryPassword).toHaveLength(12);
    expect((teacherUpdate?.set as any).password).not.toBe("T021");
    expect((studentUpdate?.set as any).password).not.toBe("S031");
    expect(operations.filter((operation) => operation.kind === "delete")).toHaveLength(2);
});
