import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("admin student list exposes temporary lock state", async () => {
    const lockedUntil = new Date("2099-01-01T00:00:00.000Z");
    const { db, operations } = createMockDb({ select: [
        [{ id: 18, studentId: "S018", name: "锁定学生", classId: 1, className: "统计一班", status: 1, lockedUntil, createdAt: new Date() }],
        [],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?student-list=${crypto.randomUUID()}`);

    const response = await module.studentRoutes.GET!(new Request("https://example.com/api/admin/students"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        data: [{ studentId: "S018", status: 1, lockedUntil: lockedUntil.toISOString() }],
    });

    const selection = operations.find((operation) => operation.kind === "select")?.selection as Record<string, unknown>;
    expect(selection).toHaveProperty("lockedUntil");
});
