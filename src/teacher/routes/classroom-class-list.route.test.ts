import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { semester, student } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

async function loadClassRoutes(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./classroom.ts?class-list=${crypto.randomUUID()}`);
    return { module, operations };
}

test("teacher class list joins semester and active students, scoped to the teacher", async () => {
    const rows = [{ id: 1, name: "统计一班", semester: "2026 秋", studentCount: 9, createdAt: "2026-09-01T00:00:00.000Z" }];
    const { module, operations } = await loadClassRoutes([rows]);

    const response = await module.classRoutes.GET!(new Request("https://example.com/api/teacher/classes"));
    const payload = await response.json() as { success: boolean; data: typeof rows };

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, data: rows.map((row) => ({ ...row, disabledStudentCount: 0 })) });

    const select = operations.find((operation) => operation.kind === "select");
    expect(select).toBeTruthy();
    expect(Object.keys(select!.selection as Record<string, unknown>)).toEqual(
        expect.arrayContaining(["id", "name", "semester", "studentCount"]),
    );
    const joinedTables = (select!.joins ?? []).map((join) => join.table);
    expect(joinedTables).toContain(semester);
    expect(joinedTables).toContain(student);
    // The roster must count enabled students only, matching task progress.
    const studentJoin = (select!.joins ?? []).find((join) => join.table === student);
    const joinCondition = new PgDialect().sqlToQuery(studentJoin!.condition as SQL);
    expect(joinCondition.sql).toContain('"student"."status"');
    expect(joinCondition.sql).toContain('"student"."class_id"');
    expect(joinCondition.params).toEqual(expect.arrayContaining([1]));
    const where = new PgDialect().sqlToQuery(select!.where as SQL);
    expect(where.sql).toContain('"class"."teacher_id"');
    expect(where.params).toEqual(expect.arrayContaining([9]));
});

test("teacher class list reports disabled students separately from the active roster", async () => {
    const rows = [{ id: 1, name: "统计一班", semester: "2026 秋", studentCount: 9, createdAt: "2026-09-01T00:00:00.000Z" }];
    const { module, operations } = await loadClassRoutes([rows, [{ classId: 1, count: 1 }]]);

    const response = await module.classRoutes.GET!(new Request("https://example.com/api/teacher/classes"));
    const payload = await response.json() as { data: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(payload.data[0]).toMatchObject({ studentCount: 9, disabledStudentCount: 1 });
    // The disabled count must not be folded into the active-student denominator.
    expect(payload.data[0]!.studentCount).toBe(9);
    const selects = operations.filter((operation) => operation.kind === "select");
    expect(selects.length).toBe(2);
});
