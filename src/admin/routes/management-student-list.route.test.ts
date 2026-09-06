import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("admin rejects invalid pagination before any database query", async () => {
    const { db, operations } = createMockDb({});
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?invalid-pagination=${crypto.randomUUID()}`);
    for (const query of ["page=99999999999999999999999", "page=Infinity", "pageSize=1.5", "page=9007199254740991&pageSize=100"]) {
        const response = await module.studentRoutes.GET!(new Request(`https://example.com/api/admin/students?${query}`));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "INVALID_PARAM" } });
    }
    expect(operations).toHaveLength(0);
});

test("admin student list exposes only active or disabled account state", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ id: 18, studentId: "S018", name: "普通学生", classId: 1, className: "统计一班", status: 1, createdAt: new Date() }],
        [],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?student-list=${crypto.randomUUID()}`);

    const response = await module.studentRoutes.GET!(new Request("https://example.com/api/admin/students"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        data: [{ studentId: "S018", status: 1 }],
    });

    const selection = operations.find((operation) => operation.kind === "select")?.selection as Record<string, unknown>;
    expect(selection).not.toHaveProperty("lockedUntil");
});

test("admin student list paginates and validates the status filter", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ id: 18, studentId: "S018", name: "普通学生", classId: 1, className: "统计一班", status: 1, createdAt: new Date() }],
        [],
        [{ count: 42 }],
    ] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?student-paged=${crypto.randomUUID()}`);

    const response = await module.studentRoutes.GET!(new Request("https://example.com/api/admin/students?status=normal&page=2&pageSize=20"));
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

    const removedLockedFilter = await module.studentRoutes.GET!(new Request("https://example.com/api/admin/students?status=locked"));
    expect(removedLockedFilter.status).toBe(400);

    const invalid = await module.studentRoutes.GET!(new Request("https://example.com/api/admin/students?status=vip"));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: { code: "INVALID_PARAM", message: "学生状态筛选无效" } });
});
