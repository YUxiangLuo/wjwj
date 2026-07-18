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
