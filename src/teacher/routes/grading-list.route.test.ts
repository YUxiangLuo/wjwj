import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

test("grading rejects invalid pagination before any database query", async () => {
    const { db, operations } = createMockDb({});
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?invalid-pagination=${crypto.randomUUID()}`);
    for (const query of ["page=99999999999999999999999", "page=Infinity", "pageSize=1.5", "page=9007199254740991&pageSize=100", "taskId=", "taskId=-1", "taskId=1.5", "taskId=abc", "taskId=9007199254740992"]) {
        const response = await module.gradingRoutes.GET!(new Request(`https://example.com/api/teacher/grading?${query}`));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "INVALID_PARAM" } });
    }
    expect(operations).toHaveLength(0);
});

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
    const response = await module.gradingRoutes.GET!(new Request("https://example.com/api/teacher/grading?status=pending&taskId=42"));
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
    expect(sql).toContain('"student"."class_id" = "task"."class_id"');
    for (const operation of operations.filter(item => item.kind === "select")) {
        const query = new PgDialect().sqlToQuery(operation.where as SQL);
        expect(query.sql).toContain('"experiment"."task_id" =');
        expect(query.sql).toContain('"class"."teacher_id" =');
        expect(query.params).toContain(42);
    }
});
