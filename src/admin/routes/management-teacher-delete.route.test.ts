import { expect, mock, test } from "bun:test";
import { auditEvent, teacher, userSession } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

async function load(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?teacher-delete=${crypto.randomUUID()}`);
    return { module, operations };
}

function deleteRequest(id: string) {
    return Object.assign(
        new Request(`https://example.com/api/admin/teachers/${id}`, { method: "DELETE" }),
        { params: { id } },
    );
}

test("teacher removal is blocked while classes or templates still reference the account", async () => {
    const { module, operations } = await load([
        [{ id: 6 }],
        [{ count: 2 }],
        [{ count: 3 }],
    ]);

    const response = await module.teacherItemRoutes.DELETE!(deleteRequest("6"));
    const payload = await response.json() as any;

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("TEACHER_IN_USE");
    expect(payload.error.message).toContain("2 个班级");
    expect(payload.error.message).toContain("3 个实验模板");
    expect(operations.some((operation) => operation.kind === "delete")).toBe(false);
});

test("teacher removal drops the account, its sessions and actor audit events", async () => {
    const { module, operations } = await load([
        [{ id: 6 }],
        [{ count: 0 }],
        [{ count: 0 }],
    ]);

    const response = await module.teacherItemRoutes.DELETE!(deleteRequest("6"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { success: true } });
    const deletedTables = operations.filter((operation) => operation.kind === "delete").map((operation) => operation.table);
    expect(deletedTables).toContain(userSession);
    expect(deletedTables).toContain(teacher);
    expect(deletedTables).toContain(auditEvent);
});

test("teacher removal answers 404 for an unknown account", async () => {
    const { module, operations } = await load([[]]);

    const response = await module.teacherItemRoutes.DELETE!(deleteRequest("404"));

    expect(response.status).toBe(404);
    expect(operations.some((operation) => operation.kind === "delete")).toBe(false);
});
