import { unlink } from "node:fs/promises";
import { expect, mock, test } from "bun:test";
import * as XLSX from "xlsx";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

function buildWorkbookBuffer(rows: unknown[][]) {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function loadTopicRoutes(options: {
    select?: unknown[];
    teacherId?: number;
} = {}) {
    const { db, operations } = createMockDb(options);

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
        requirePrimaryTeacher: async () => ({ teacherId: options.teacherId ?? 9, error: null }),
        notifyStudentsByClassIds: async () => undefined,
        getCurrentUser: async () => ({ id: options.teacherId ?? 9, type: "teacher" }),
        notifyStudentById: async () => undefined,
        isLockExpired: () => true,
        TEACHER_USER_TYPE: 2,
    }));

    const module = await import("./topic-task");
    return { module, operations };
}

test("topic detail returns attachments, recommended questions, and parsed excel preview", async () => {
    const relativePath = `/storage/uploads/topic-detail-${Date.now()}.xlsx`;
    const absolutePath = `${process.cwd()}${relativePath}`;
    const buffer = buildWorkbookBuffer([
        ["name", "score"],
        ["Alice", 95],
        ["Bob", 88],
    ]);

    await Bun.write(absolutePath, buffer);

    try {
        const { module } = await loadTopicRoutes({
            select: [
                [{ id: 12, status: 0 }],
                [{
                    id: 12,
                    name: "抽样设计课题",
                    description: "用于详情测试",
                    excelFilePath: relativePath,
                    excelRowCount: 2,
                    recommendQuestions: [{ id: "q1", type: "boolean", content: "你最关注哪项指标？" }],
                }],
                [{
                    id: 5,
                    topicId: 12,
                    fileName: "guide.pdf",
                    filePath: "/storage/uploads/guide.pdf",
                    fileType: "application/pdf",
                    fileSize: 1024,
                }],
            ],
        });

        const request = withRouteParam(new Request("https://example.com/api/teacher/topics/12", {
            method: "GET",
        }), "12");

        const response = await module.topicDetailRoutes.GET!(request);
        const payload = await response.json() as any;

        expect(response.status).toBe(200);
        expect(payload.data.topic).toMatchObject({
            id: 12,
            name: "抽样设计课题",
        });
        expect(payload.data.attachments).toHaveLength(1);
        expect(payload.data.recommendQuestions).toHaveLength(1);
        expect(payload.data.excelInfo).toEqual({
            columns: ["name", "score"],
            preview: [
                { name: "Alice", score: 95 },
                { name: "Bob", score: 88 },
            ],
        });
    } finally {
        await unlink(absolutePath).catch(() => undefined);
    }
});

test("topic detail returns 404 for topics outside the teacher scope", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [[]],
    });

    const request = withRouteParam(new Request("https://example.com/api/teacher/topics/12", {
        method: "GET",
    }), "12");

    const response = await module.topicDetailRoutes.GET!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(404);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "NOT_FOUND",
            message: "课题不存在",
        },
    });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(1);
});
