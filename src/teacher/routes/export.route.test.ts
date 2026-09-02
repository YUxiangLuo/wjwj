import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { semester } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

async function loadExportRoutes(options: {
    teacherId?: number;
    select?: unknown[];
} = {}) {
    const { db, operations } = createMockDb({
        select: options.select,
    });

    mock.module("../../db", () => ({ db }));
    mock.module("../../utils/format", () => ({
        formatDateStampCN: () => "2026-03-09",
        formatDateTimeCN: () => "2026/03/09 04:25:06",
    }));
    mock.module("./auth", () => createTeacherAuthModuleMock({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
    }));

    const module = await import("./export");
    return { module, operations };
}

test("grade export preview accepts semester filter and joins semester data", async () => {
    const { module, operations } = await loadExportRoutes({
        select: [[{
            taskId: 12,
            topicId: 8,
            topicName: "消费者行为分析实验",
            classId: 3,
            className: "统计学原理 A班",
            graded: 5,
            total: 8,
            avgScore: "87.5",
        }]],
    });

    const response = await module.gradeExportPreviewRoutes.GET!(
        new Request("https://example.com/api/teacher/grade-export/preview?semester=2024-2025%E5%AD%A6%E5%B9%B4%20%E7%AC%AC%E4%B8%80%E5%AD%A6%E6%9C%9F")
    );
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload.data).toEqual([{
        taskId: 12,
        topicId: 8,
        topic: "消费者行为分析实验",
        classId: 3,
        className: "统计学原理 A班",
        graded: 5,
        total: 8,
        avgScore: 87.5,
    }]);

    const query = operations.find((operation) => operation.kind === "select");
    expect(query?.joins).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ type: "innerJoin", table: semester }),
        ])
    );
    const selection = query?.selection as { graded?: SQL; avgScore?: SQL } | undefined;
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(selection!.graded!).sql).toContain("INNER JOIN student counted_student");
    expect(dialect.sqlToQuery(selection!.graded!).sql).toContain('counted_student.class_id = "task"."class_id"');
    expect(dialect.sqlToQuery(selection!.avgScore!).sql).toContain('counted_student.class_id = "task"."class_id"');
});

test("grade export data uses immutable student and topic names", async () => {
    const { module, operations } = await loadExportRoutes({
        select: [[{
            studentId: "2024001",
            studentName: "当前学生名",
            className: "统计学原理 A班",
            topicName: "当前课题名",
            submittedAt: new Date("2026-03-09T04:25:06+08:00"),
            scoreQuestionnaire: "88.00",
            scoreProcess: "90.00",
            scoreReport: "91.00",
            totalScore: "89.90",
            status: "graded",
            gradedByName: "张教授",
            gradedAt: new Date("2026-03-09T04:25:06+08:00"),
            submissionSnapshot: { studentName: "提交时学生名", topicName: "提交时课题名" },
        }]],
    });

    const response = await module.gradeExportDataRoutes.GET!(
        new Request("https://example.com/api/teacher/grade-export/data?taskId=12"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
        data: [{ studentId: "2024001", name: "提交时学生名", topicName: "提交时课题名" }],
    });
    const query = operations.find((operation) => operation.kind === "select");
    const sql = new PgDialect().sqlToQuery(query?.where as SQL).sql;
    expect(sql).toContain('"student"."class_id" = "task"."class_id"');
});

test("grade analytics includes students without experiments and summarizes graded scores", async () => {
    const { module, operations } = await loadExportRoutes({
        select: [
            [
                { status: null, count: 3 },
                { status: "in_progress", count: 2 },
                { status: "submitted", count: 1 },
                { status: "graded", count: 4 },
                { status: "rejected", count: 1 },
            ],
            [{
                count: 4,
                average: 82.5,
                median: 84,
                questionnaireAverage: 80,
                processAverage: 83,
                reportAverage: 85,
                below60: 0,
                from60To69: 1,
                from70To79: 0,
                from80To89: 2,
                from90To100: 1,
            }],
        ],
    });

    const response = await module.gradeAnalyticsRoutes.GET!(
        new Request("https://example.com/api/teacher/grade-export/analytics?classId=3"),
    );
    expect(response.status).toBe(200);
    const payload = await response.json() as any;
    expect(payload.data.funnel).toEqual({ total: 11, notStarted: 3, inProgress: 2, pendingGrading: 1, graded: 4, rejected: 1 });
    expect(payload.data.scores).toMatchObject({ count: 4, average: 82.5, median: 84, componentAverages: { questionnaire: 80, process: 83, report: 85 } });
    expect(payload.data.scores.bands.slice(0, 2)).toEqual([{ label: "<60", count: 0 }, { label: "60–69", count: 1 }]);
    const scoreQuery = operations.filter((operation) => operation.kind === "select")[1];
    const sql = new PgDialect().sqlToQuery(scoreQuery?.where as SQL).sql;
    expect(sql).toContain('"student"."class_id" = "task"."class_id"');
});

test("grade export excel uses local date stamp for download filename", async () => {
    const { module } = await loadExportRoutes({
        select: [[{
            studentId: "2024001",
            studentName: "钱二",
            className: "统计学原理 A班",
            topicName: "消费者行为分析实验",
            submittedAt: new Date("2026-03-09T04:25:06+08:00"),
            scoreQuestionnaire: "28.00",
            scoreProcess: "26.00",
            scoreReport: "35.00",
            totalScore: "30.20",
            status: 2,
            gradedByType: 2,
            gradedById: 9,
            gradedByName: "张教授（演示）",
            gradedAt: new Date("2026-03-09T04:25:06+08:00"),
            submissionSnapshot: { studentName: "钱二", topicName: "消费者行为分析实验" },
        }]],
    });

    const response = await module.gradeExportExcelRoutes.GET!(
        new Request("https://example.com/api/teacher/grade-export/excel?taskId=12")
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
        "attachment; filename=grade-export-2026-03-09.xlsx"
    );
});

test("grade export rejects fractional, negative, and exponent-form identifiers", async () => {
    const { module, operations } = await loadExportRoutes();
    for (const query of ["classId=1.5", "topicId=-1", "taskId=1e2", "taskIds=1,2abc"]) {
        const response = await module.gradeExportDataRoutes.GET!(
            new Request(`https://example.com/api/teacher/grade-export/data?${query}`),
        );
        expect(response.status).toBe(400);
    }
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(0);
});
