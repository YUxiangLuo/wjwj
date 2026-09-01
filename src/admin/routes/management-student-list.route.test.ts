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

test("admin student list paginates and validates the status filter", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ id: 18, studentId: "S018", name: "锁定学生", classId: 1, className: "统计一班", status: 1, lockedUntil: new Date("2099-01-01T00:00:00.000Z"), createdAt: new Date() }],
        [],
        [{ count: 42 }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?student-paged=${crypto.randomUUID()}`);

    const response = await module.studentRoutes.GET!(new Request("https://example.com/api/admin/students?status=locked&page=2&pageSize=20"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        data: {
            items: [{ studentId: "S018" }],
            total: 42,
            page: 2,
            pageSize: 20,
        },
    });
    // 分页时列表查询带 limit/offset，且另有 count 查询
    expect(operations.filter((item) => item.kind === "select").length).toBe(3);

    const invalid = await module.studentRoutes.GET!(new Request("https://example.com/api/admin/students?status=vip"));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "INVALID_PARAM", message: "学生状态筛选无效" } });
});
