import { expect, mock, test } from "bun:test";
import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
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

    const orderBy = operations.find((operation) => operation.kind === "select")?.orderBy as SQL[];
    expect(orderBy).toHaveLength(2);
    const orderSql = new PgDialect().sqlToQuery(sql.join(orderBy, sql`, `)).sql;
    expect(orderSql).toContain('"student"."created_at" desc');
    expect(orderSql).toContain('"student"."id" desc');
});
