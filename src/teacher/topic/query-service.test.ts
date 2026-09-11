import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { class_, experiment, student, topic } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

async function loadQueryService(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./query-service.ts?query=${crypto.randomUUID()}`);
    return { module, operations };
}

test("listTeacherTopics projects description, row count and assignment, scoped to the teacher", async () => {
    const { module, operations } = await loadQueryService([[]]);

    await module.listTeacherTopics(9);

    const select = operations.find((operation) => operation.kind === "select");
    expect(select).toBeTruthy();
    expect(Object.keys(select!.selection as Record<string, unknown>)).toEqual(
        expect.arrayContaining(["id", "name", "description", "status", "dataRows", "hasTasks"]),
    );
    const where = new PgDialect().sqlToQuery(select!.where as SQL);
    expect(where.sql).toContain('"topic"."teacher_id"');
    expect(where.params).toEqual(expect.arrayContaining([9]));
});

test("getTeacherTopicDetail never leaks the owner id or storage path", async () => {
    const topicInfo = {
        id: 12,
        teacherId: 9,
        name: "抽样设计",
        description: "描述",
        excelFilePath: `/storage/does-not-exist-${crypto.randomUUID()}.csv`,
        excelRowCount: 30,
        fieldMapping: null,
        samplingPolicy: null,
        weightConfig: null,
        recommendQuestions: null,
        status: 1,
    };
    const { module } = await loadQueryService([[topicInfo], []]);

    const detail = await module.getTeacherTopicDetail(12);

    expect(detail.topic).not.toHaveProperty("teacherId");
    expect(detail.topic).not.toHaveProperty("excelFilePath");
    expect((detail.topic as { name: string }).name).toBe("抽样设计");
    expect(detail.recommendQuestions).toEqual([]);
    expect(detail.hasExcelFile).toBe(true);
    // The stored file is unreachable, so the parse must degrade to null, not throw.
    expect(detail.excelInfo).toBeNull();
});

test("getTeacherTaskProgress returns null for a task outside the teacher's classes", async () => {
    const { module } = await loadQueryService([[]]);

    expect(await module.getTeacherTaskProgress(7, 9)).toBeNull();
});

test("getTeacherTaskProgress buckets every student through the shared snapshot", async () => {
    const taskRow = { id: 7, topicName: "咖啡馆", className: "统计一班", classId: 3, deadline: null };
    const students = [
        { studentId: "S001", name: "甲", experimentId: null, currentStage: null, experimentStatus: null, lastActivity: null },
        { studentId: "S002", name: "乙", experimentId: 11, currentStage: 2, experimentStatus: "in_progress", lastActivity: null },
        { studentId: "S003", name: "丙", experimentId: 12, currentStage: 4, experimentStatus: "submitted", lastActivity: null },
        { studentId: "S004", name: "丁", experimentId: 13, currentStage: 4, experimentStatus: "graded", lastActivity: null },
    ];
    const { module } = await loadQueryService([[taskRow], students]);

    const progress = await module.getTeacherTaskProgress(7, 9);

    expect(progress?.task).toEqual({ topicName: "咖啡馆", className: "统计一班", deadline: null });
    expect(progress?.counts).toMatchObject({ not_started: 1, stage2: 1, submitted: 1, graded: 1 });
    type ProgressRow = { status: string; submissionId: number | null };
    expect((progress?.students as ProgressRow[]).map((row) => row.status)).toEqual(["not_started", "stage2", "submitted", "graded"]);
    const graded = (progress?.students as ProgressRow[]).find((row) => row.status === "graded");
    expect(graded?.submissionId).toBe(13);
});

test("listTeacherTasks joins class, topic, students and experiments and filters by the owning class", async () => {
    const { module, operations } = await loadQueryService([[]]);

    await module.listTeacherTasks(9);

    const select = operations.find((operation) => operation.kind === "select");
    expect(select).toBeTruthy();
    const joinedTables = (select!.joins ?? []).map((join) => join.table);
    expect(joinedTables).toContain(topic);
    expect(joinedTables).toContain(class_);
    expect(joinedTables).toContain(student);
    expect(joinedTables).toContain(experiment);
    const where = new PgDialect().sqlToQuery(select!.where as SQL);
    expect(where.sql).toContain('"class"."teacher_id"');
    expect(where.params).toEqual(expect.arrayContaining([9]));
});
