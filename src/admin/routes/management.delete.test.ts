import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("class delete is blocked while students or tasks still reference it", async () => {
    const { db, operations } = createMockDb({ select: [[{ count: 5 }], [{ count: 0 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?delete=${crypto.randomUUID()}`);
    const request = Object.assign(new Request("https://example.com/api/admin/classes/9", { method: "DELETE" }), { params: { id: "9" } });
    const response = await module.classUpdateRoutes.DELETE!(request);
    expect(response.status).toBe(409);
    const payload = await response.json() as any;
    expect(payload).toMatchObject({ error: { code: "CLASS_IN_USE" } });
    expect(payload.error.message).toContain("5 名学生");
    expect(operations.some((item) => item.kind === "delete")).toBe(false);
});
