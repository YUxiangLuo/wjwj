import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

async function loadManagementModule(options: {
    select?: unknown[];
    insert?: unknown[];
    update?: unknown[];
    delete?: unknown[];
} = {}) {
    const { db, operations } = createMockDb(options);

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        ADMIN_USER_TYPE: 1,
        ADMIN_SESSION_COOKIE: "admin_session",
        getAdminUser: () => ({ id: 1, username: "admin", isFirstLogin: 0 }),
    }));

    const module = await import(`./management?management-delete-test=${Math.random()}`);
    return { module, operations };
}

test("class delete soft-deletes class students before removing the class", async () => {
    const { module, operations } = await loadManagementModule({
        select: [[{ id: 9 }]],
    });

    const req = Object.assign(new Request("https://example.com/api/admin/classes/9", {
        method: "DELETE",
    }), {
        params: { id: "9" },
    });

    const response = await module.classUpdateRoutes.DELETE!(req);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({
        success: true,
        data: { success: true },
    });

    const studentUpdate = operations.find((operation) => operation.kind === "update");
    expect(studentUpdate?.set).toMatchObject({
        deletedAt: expect.any(Date),
        status: 0,
    });

    const classDelete = operations.find((operation) => operation.kind === "delete");
    expect(classDelete).toBeDefined();
    expect(operations.find((operation) => operation.kind === "transaction")).toBeDefined();
});
