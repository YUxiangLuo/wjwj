import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";
import { student } from "../../db/schema";

test("dashboard counts only visible activity and currently open tasks", async () => {
    const deadline = new Date("2026-07-28T02:00:00Z");
    const { db, operations } = createMockDb({ select: [
        [{ count: 1 }],
        [{ count: 2 }],
        [{ count: 3 }],
        [{ count: 4 }],
        [{ id: 8, className: "统计一班", topicName: "抽样调查", deadline, total: 10, completed: 4, pending: 2, rejected: 1 }],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./dashboard.ts?dashboard=${crypto.randomUUID()}`);

    const response = await module.dashboardRoutes.GET!(new Request("https://example.com/api/teacher/dashboard"));
    const payload = await response.json() as any;

    expect(payload.data.activeTasks).toEqual([
        expect.objectContaining({ id: 8, templateName: "抽样调查", className: "统计一班", completed: 4, pending: 2, rejected: 1 }),
    ]);

    const selects = operations.filter((item) => item.kind === "select");
    expect(selects[2]!.joins?.map((join) => join.table)).toContain(student);
    const dialect = new PgDialect();
    const pendingQuery = dialect.sqlToQuery(selects[2]!.where as SQL);
    const activeTaskQuery = dialect.sqlToQuery(selects[3]!.where as SQL);
    const activeListQuery = dialect.sqlToQuery(selects[4]!.where as SQL);
    expect(pendingQuery.sql).toContain('"student"."deleted_at" is null');
    expect(pendingQuery.sql).toContain('"student"."class_id" = "task"."class_id"');
    expect(selects[4]!.joins?.map((join) => join.table)).toContain(student);
    expect(pendingQuery.params).toEqual([9, "submitted"]);
    expect(activeTaskQuery.sql).toContain('"task"."open_time" is null or "task"."open_time" <=');
    expect(activeTaskQuery.sql).toContain('"task"."deadline" is null or "task"."deadline" >');
    expect(activeTaskQuery.params.slice(0, 2)).toEqual([9, 1]);
    expect(typeof activeTaskQuery.params[2]).toBe("string");
    expect(Number.isNaN(Date.parse(activeTaskQuery.params[2] as string))).toBe(false);
    expect(activeTaskQuery.params[3]).toEqual(activeTaskQuery.params[2]);
    expect(activeListQuery.sql).toContain('"task"."open_time" is null or "task"."open_time" <=');
    expect(activeListQuery.sql).toContain('"task"."deadline" is null or "task"."deadline" >');
});
