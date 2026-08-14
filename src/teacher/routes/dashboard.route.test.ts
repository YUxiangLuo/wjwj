import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";
import { student } from "../../db/schema";

test("dashboard counts only visible activity and currently open tasks", async () => {
    const submittedAt = new Date("2026-07-18T01:00:00Z");
    const gradedAt = new Date("2026-07-18T02:00:00Z");
    const { db, operations } = createMockDb({ select: [
        [{ count: 1 }],
        [{ count: 2 }],
        [{ count: 3 }],
        [{ count: 4 }],
        [{ studentName: "已批改学生", className: "统计一班", topicName: "抽样调查", submittedAt }],
        [{ studentName: "被驳回学生", className: "统计一班", topicName: "抽样调查", totalScore: null, status: "rejected", gradedAt }],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./dashboard.ts?dashboard=${crypto.randomUUID()}`);

    const response = await module.dashboardRoutes.GET!(new Request("https://example.com/api/teacher/dashboard"));
    const payload = await response.json() as any;

    expect(payload.data.recentSubmissions).toEqual([
        expect.objectContaining({ student: "已批改学生", topic: "抽样调查" }),
    ]);
    expect(payload.data.recentGradings).toEqual([
        expect.objectContaining({ student: "被驳回学生", rejected: true, score: null }),
    ]);

    const selects = operations.filter((item) => item.kind === "select");
    expect(selects[2]!.joins?.map((join) => join.table)).toContain(student);
    const dialect = new PgDialect();
    const pendingQuery = dialect.sqlToQuery(selects[2]!.where as SQL);
    const activeTaskQuery = dialect.sqlToQuery(selects[3]!.where as SQL);
    const recentSubmissionQuery = dialect.sqlToQuery(selects[4]!.where as SQL);
    const recentGradingQuery = dialect.sqlToQuery(selects[5]!.where as SQL);
    for (const query of [pendingQuery, recentSubmissionQuery, recentGradingQuery]) {
        expect(query.sql).toContain('"student"."deleted_at" is null');
    }
    expect(pendingQuery.params).toEqual([9, "submitted"]);
    expect(activeTaskQuery.sql).toContain('"task"."open_time" is null or "task"."open_time" <=');
    expect(activeTaskQuery.sql).toContain('"task"."deadline" is null or "task"."deadline" >');
    expect(activeTaskQuery.params.slice(0, 2)).toEqual([9, 1]);
    expect(typeof activeTaskQuery.params[2]).toBe("string");
    expect(Number.isNaN(Date.parse(activeTaskQuery.params[2] as string))).toBe(false);
    expect(activeTaskQuery.params[3]).toEqual(activeTaskQuery.params[2]);
    expect(recentSubmissionQuery.params).toEqual([9, "submitted", "graded", "rejected"]);
    expect(recentGradingQuery.params).toEqual([9, "graded", "rejected"]);
});
