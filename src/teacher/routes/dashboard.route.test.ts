import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";
import { student } from "../../db/schema";

test("dashboard keeps completed activity but excludes soft-deleted students from every activity query", async () => {
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
    const recentSubmissionQuery = dialect.sqlToQuery(selects[4]!.where as SQL);
    const recentGradingQuery = dialect.sqlToQuery(selects[5]!.where as SQL);
    for (const query of [pendingQuery, recentSubmissionQuery, recentGradingQuery]) {
        expect(query.sql).toContain('"student"."deleted_at" is null');
    }
    expect(pendingQuery.params).toEqual([9, "submitted"]);
    expect(recentSubmissionQuery.params).toEqual([9, "submitted", "graded", "rejected"]);
    expect(recentGradingQuery.params).toEqual([9, "graded", "rejected"]);
});
