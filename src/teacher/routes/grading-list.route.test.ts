import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

test("grading list reads current experiment statuses directly", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ count: 1 }],
        [{
            id: 7,
            studentName: "当前学生名",
            studentId: "S001",
            topic: "当前课题名",
            className: "统计一班",
            submittedAt: new Date(),
            status: "submitted",
            score: null,
            gradedByName: null,
            gradedAt: null,
            submissionSnapshot: { studentName: "提交时学生名", topicName: "提交时课题名" },
            studentClassId: 3,
            taskClassId: 3,
        }],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?list=${crypto.randomUUID()}`);
    const response = await module.gradingRoutes.GET!(new Request("https://example.com/api/teacher/grading?status=pending"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        data: {
            total: 1,
            items: [{ id: 7, status: "submitted", studentName: "提交时学生名", topic: "提交时课题名" }],
        },
    });
    expect(operations.filter((item) => item.kind === "select")).toHaveLength(2);

    const listQuery = operations.find((item) => item.kind === "select");
    const sql = new PgDialect().sqlToQuery(listQuery?.where as SQL).sql;
    expect(sql).toContain('"student"."deleted_at" is null');
    expect(sql).toContain('"student"."class_id" = "task"."class_id"');
});

test("grading list includes archived rows only when requested", async () => {
    const { db, operations } = createMockDb({ select: [
        [{ count: 2 }],
        [
            {
                id: 7, studentName: "学生甲", studentId: "S001", topic: "课题A", className: "统计一班",
                submittedAt: new Date(), status: "submitted", score: null, gradedByName: null, gradedAt: null,
                submissionSnapshot: null,
                studentDeletedAt: null, taskDeletedAt: null, topicDeletedAt: null,
                studentClassId: 3, taskClassId: 3,
            },
            {
                id: 8, studentName: "学生乙", studentId: "S002", topic: "课题B", className: "统计一班",
                submittedAt: new Date(), status: "graded", score: "90.00", gradedByName: "张老师", gradedAt: new Date(),
                submissionSnapshot: null,
                studentDeletedAt: null, taskDeletedAt: null, topicDeletedAt: null,
                studentClassId: 4, taskClassId: 3,
            },
        ],
    ] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?list-archived=${crypto.randomUUID()}`);
    const response = await module.gradingRoutes.GET!(new Request("https://example.com/api/teacher/grading?includeArchived=1"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.items).toHaveLength(2);
    expect(payload.data.items[0]).toMatchObject({ id: 7, archived: false });
    expect(payload.data.items[1]).toMatchObject({ id: 8, archived: true });

    const listQuery = operations.find((item) => item.kind === "select");
    const sql = new PgDialect().sqlToQuery(listQuery?.where as SQL).sql;
    expect(sql).not.toContain('"student"."deleted_at" is null');
    expect(sql).not.toContain('"task"."deleted_at" is null');
    expect(sql).not.toContain('"student"."class_id" = "task"."class_id"');
});
