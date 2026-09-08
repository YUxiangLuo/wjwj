import { expect, mock, test } from "bun:test";
import { student, userSession } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function request(params: Record<string, string>, body: unknown) {
    const req = new Request("https://example.com", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    (req as Request & { params: Record<string, string> }).params = params;
    return req;
}

async function load(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const routes = await import(`./classroom.ts?ownership=${crypto.randomUUID()}`);
    return { routes, operations };
}

for (const action of ["reset_password", "toggle_status"] as const) {
    test(`${action} refuses a class transferred after the initial ownership check`, async () => {
        const { routes, operations } = await load([[{ id: 12, studentId: "S012", status: 1 }], []]);
        const response = await routes.studentRoutes.PUT!(request({ id: "12" }, { action }));
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
        expect(operations.some(op => op.kind === "update" || op.kind === "delete")).toBe(false);
    });
}

test("student creation rechecks class ownership after password work", async () => {
    const { routes, operations } = await load([[{ id: 3 }], [], []]);
    const response = await routes.classStudentsRoutes.POST!(request({ classId: "3" }, { studentId: "S012", name: "学生" }));
    expect(response.status).toBe(403);
    expect(operations.some(op => op.kind === "insert")).toBe(false);
});

test("student import rechecks class ownership before inserting the batch", async () => {
    const { routes, operations } = await load([[{ id: 3 }], [], []]);
    const form = new FormData();
    form.append("file", new File(["studentId,name\nS012,学生\n"], "students.csv", { type: "text/csv" }));
    const req = new Request("https://example.com", { method: "POST", body: form });
    (req as Request & { params: Record<string, string> }).params = { classId: "3" };
    expect((await routes.classStudentsImportRoutes.POST!(req)).status).toBe(403);
    expect(operations.some(op => op.kind === "insert")).toBe(false);
});

test("status toggle uses the locked student's latest status and clears sessions in the same transaction", async () => {
    const { routes, operations } = await load([
        [{ id: 12, studentId: "S012", status: 0 }],
        [{ id: 12, studentId: "S012", status: 1 }],
    ]);
    expect((await routes.studentRoutes.PUT!(request({ id: "12" }, { action: "toggle_status" }))).status).toBe(200);
    expect(operations.find(op => op.kind === "update" && op.table === student)?.set).toMatchObject({ status: 0 });
    const transaction = operations.findIndex(op => op.kind === "transaction");
    const update = operations.findIndex(op => op.kind === "update");
    const clear = operations.findIndex(op => op.kind === "delete" && op.table === userSession);
    expect(transaction).toBeGreaterThanOrEqual(0);
    expect(update).toBeGreaterThan(transaction);
    expect(clear).toBeGreaterThan(update);
});
