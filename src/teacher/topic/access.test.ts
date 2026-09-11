import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createMockDb } from "../../test-utils/mock-db";

async function loadAccess(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./access.ts?access=${crypto.randomUUID()}`);
    return { module, operations };
}

test("requireTopicOwner returns the owned topic row", async () => {
    const row = { id: 12, status: 1, excelFilePath: "/storage/x.xlsx", hasTasks: true };
    const { module } = await loadAccess([[row]]);

    expect(await module.requireTopicOwner(12, 9)).toEqual(row);
});

test("requireTopicOwner returns null when the topic is missing or owned by another teacher", async () => {
    const { module } = await loadAccess([[]]);

    expect(await module.requireTopicOwner(12, 9)).toBeNull();
});

test("requireTopicOwner scopes the lookup to the topic and teacher and reports assignment", async () => {
    const { module, operations } = await loadAccess([[{ id: 12, status: 0, excelFilePath: null, hasTasks: false }]]);

    await module.requireTopicOwner(12, 9);

    const select = operations.find((operation) => operation.kind === "select");
    expect(select).toBeTruthy();
    expect(Object.keys(select!.selection as Record<string, unknown>)).toEqual(
        expect.arrayContaining(["id", "status", "excelFilePath", "hasTasks"]),
    );
    const where = new PgDialect().sqlToQuery(select!.where as SQL);
    expect(where.sql).toContain('"topic"."id"');
    expect(where.sql).toContain('"topic"."teacher_id"');
    expect(where.params).toEqual(expect.arrayContaining([12, 9]));
});
