import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function createJsonRequest(url: string, method: string, body?: unknown) {
    return new Request(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
}

test("semester create rejects names longer than 20 characters before touching the database", async () => {
    const { db, operations } = createMockDb();
    mock.module("../../db", () => ({ db }));

    const module = await import(`./management?semester-create-validation-test=${Math.random()}`);
    const response = await module.semesterRoutes.POST!(createJsonRequest(
        "https://example.com/api/admin/semesters",
        "POST",
        { name: "123456789012345678901" }
    ));
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "学期名称须为1-20个字符",
        },
    });
    expect(operations).toHaveLength(0);
});

test("semester update rejects names longer than 20 characters before touching the database", async () => {
    const { db, operations } = createMockDb();
    mock.module("../../db", () => ({ db }));

    const module = await import(`./semester?semester-update-validation-test=${Math.random()}`);
    const req = Object.assign(createJsonRequest(
        "https://example.com/api/admin/semesters/8/update",
        "PUT",
        { name: "123456789012345678901" }
    ), {
        params: { id: "8" },
    });
    const response = await module.semesterUpdateRoutes.PUT!(req);
    const payload = await response.json() as any;

    expect(response.status).toBe(400);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "学期名称不能超过20个字符",
        },
    });
    expect(operations).toHaveLength(0);
});

test("semester update explicitly advances updatedAt", async () => {
    const { db, operations } = createMockDb({ select: [[]] });
    mock.module("../../db", () => ({ db }));

    const module = await import(`./semester?semester-update-timestamp-test=${crypto.randomUUID()}`);
    const req = Object.assign(createJsonRequest(
        "https://example.com/api/admin/semesters/8/update",
        "PUT",
        { name: "2026 秋季" },
    ), {
        params: { id: "8" },
    });

    const response = await module.semesterUpdateRoutes.PUT!(req);

    expect(response.status).toBe(200);
    const update = operations.find((operation) => operation.kind === "update");
    expect(update?.set).toMatchObject({ name: "2026 秋季", updatedAt: expect.any(Date) });
});

test("semester update returns not found when the target row does not exist", async () => {
    const { db } = createMockDb({ select: [[]], update: [[]] });
    mock.module("../../db", () => ({ db }));

    const module = await import(`./semester?semester-update-not-found-test=${crypto.randomUUID()}`);
    const req = Object.assign(createJsonRequest(
        "https://example.com/api/admin/semesters/999999/update",
        "PUT",
        { name: "不存在学期" },
    ), {
        params: { id: "999999" },
    });

    const response = await module.semesterUpdateRoutes.PUT!(req);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
        success: false,
        error: { code: "NOT_FOUND", message: "学期不存在" },
    });
});
