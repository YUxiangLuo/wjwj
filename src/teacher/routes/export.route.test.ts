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
    mock.module("./auth", () => ({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
        requirePrimaryTeacher: async () => ({ teacherId: options.teacherId ?? 9, error: null }),
        getCurrentUser: async () => ({ id: options.teacherId ?? 9, type: "teacher" }),
        notifyStudentById: async () => undefined,
        isLockExpired: () => true,
        TEACHER_USER_TYPE: 2,
        ASSISTANT_USER_TYPE: 3,
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
