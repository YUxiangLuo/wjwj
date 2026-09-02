import { expect, mock, test } from "bun:test";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withClassId(request: Request, classId: string) {
    (request as Request & { params?: Record<string, string> }).params = { classId };
    return request;
}

test("teacher student list omits removed lock state", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ id: 1 }],
        [{ id: 18, studentId: "S018", name: "普通学生", email: null, status: 1 }],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./classroom.ts?student-list=${crypto.randomUUID()}`);

    const response = await module.classStudentsRoutes.GET!(withClassId(
        new Request("https://example.com/api/teacher/classes/1/students"),
        "1",
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        data: [{ studentId: "S018", status: 1 }],
    });

    const selections = operations
        .filter((operation) => operation.kind === "select")
        .map((operation) => operation.selection as Record<string, unknown>);
    expect(selections[1]).not.toHaveProperty("lockedUntil");
});
