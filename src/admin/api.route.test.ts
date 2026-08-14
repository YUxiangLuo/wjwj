import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { student } from "../db/schema";
import { createMockDb } from "../test-utils/mock-db";

test("admin pending count excludes soft-deleted students", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ name: "2026-2027-1" }],
        [{ count: 3 }],
        [{ count: 2 }],
        [{ count: 10 }],
        [{ count: 2 }],
    ] });
    mock.module("../db", () => ({ db }));
    const module = await import(`./api.ts?stats=${crypto.randomUUID()}`);

    const response = await module.statsRoutes.GET!(new Request("https://example.com/api/admin/stats"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { pendingItems: 2 } });

    const selects = operations.filter((item) => item.kind === "select");
    expect(selects[4]!.joins?.map((join) => join.table)).toContain(student);
    const pendingQuery = new PgDialect().sqlToQuery(selects[4]!.where as SQL);
    expect(pendingQuery.sql).toContain('"student"."deleted_at" is null');
    expect(pendingQuery.params).toEqual(["submitted"]);
});
