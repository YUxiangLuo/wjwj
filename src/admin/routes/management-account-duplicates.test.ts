import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function teacherCreateRequest(employeeId: string, name = "张三") {
    return new Request("https://example.com/api/admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, name }),
    });
}

test("admin teacher creation rejects an occupied employee ID without creating a row", async () => {
    const { db, operations } = createMockDb({ select: [[{ id: 12 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?dup=${crypto.randomUUID()}`);

    const response = await module.teacherRoutes.POST!(teacherCreateRequest("T001"));
    const payload = await response.json() as any;

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("DUPLICATE_ID");
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});
