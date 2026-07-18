import { expect, mock, test } from "bun:test";
import { semester } from "../../db/schema";
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
    mock.module("./auth", () => ({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
        requirePrimaryTeacher: async () => ({ teacherId: options.teacherId ?? 9, error: null }),
        getCurrentUser: async () => ({ id: options.teacherId ?? 9, type: "teacher" }),
        notifyStudentsByClassIds: async () => undefined,
        notifyStudentById: async () => undefined,
        isLockExpired: () => true,
        TEACHER_USER_TYPE: 2,
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
