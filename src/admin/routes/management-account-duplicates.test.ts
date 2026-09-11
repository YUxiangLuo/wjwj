import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function teacherCreateRequest(employeeId: string, name = "张三") {
    return new Request("https://example.com/api/admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId, name }),
    });
}

test("admin teacher creation explains that an occupied employee ID belongs to a disabled account", async () => {
    const { db, operations } = createMockDb({ select: [[{ id: 12, status: 0 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?dup-disabled=${crypto.randomUUID()}`);

    const response = await module.teacherRoutes.POST!(teacherCreateRequest("T001"));
    const payload = await response.json() as any;

    // The employee ID is globally unique and the account still owns it, so the
    // admin must reactivate the existing row instead of creating a new one.
    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("DUPLICATE_ID");
    expect(payload.error.message).toContain("已停用");
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});

test("admin teacher creation keeps rejecting an active duplicate without resending the hint", async () => {
    const { db, operations } = createMockDb({ select: [[{ id: 12, status: 1 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?dup-active=${crypto.randomUUID()}`);

    const response = await module.teacherRoutes.POST!(teacherCreateRequest("T001"));
    const payload = await response.json() as any;

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("DUPLICATE_ID");
    expect(payload.error.message).not.toContain("已停用");
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});
