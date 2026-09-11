import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createMockDb } from "../../test-utils/mock-db";

async function loadAnnouncements(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./announcements.ts?announcements=${crypto.randomUUID()}`);
    return { module, operations };
}

test("teacher announcements project the fields the panel renders", async () => {
    const rows = [{ id: 1, title: "维护通知", content: "<p>今晚维护</p>", createdAt: "2026-09-01T00:00:00.000Z" }];
    const { module } = await loadAnnouncements([rows]);

    const response = await module.teacherAnnouncementsRoutes.GET!(new Request("https://example.com/api/teacher/announcements"));
    const payload = await response.json() as { success: boolean; data: typeof rows };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, data: rows });
});

test("teacher announcements only read published entries scoped to all or teacher", async () => {
    const { module, operations } = await loadAnnouncements([[]]);

    await module.teacherAnnouncementsRoutes.GET!(new Request("https://example.com/api/teacher/announcements"));

    const select = operations.find((operation) => operation.kind === "select");
    expect(select).toBeTruthy();
    expect(Object.keys(select!.selection as Record<string, unknown>)).toEqual(
        expect.arrayContaining(["id", "title", "content", "createdAt"]),
    );
    const where = new PgDialect().sqlToQuery(select!.where as SQL);
    expect(where.sql).toContain('"announcement"."status"');
    expect(where.sql).toContain('"announcement"."target_scope"');
    expect(where.params).toEqual(expect.arrayContaining([1, "all", "teacher"]));
});
