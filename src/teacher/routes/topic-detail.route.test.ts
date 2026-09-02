import { unlink } from "node:fs/promises";
import { expect, mock, test } from "bun:test";
import * as XLSX from "xlsx";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
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
    mock.module("./auth", () => createTeacherAuthModuleMock({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
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
        expect(payload.data.hasExcelFile).toBe(true);
        expect(payload.data.attachments).toHaveLength(1);
        expect(payload.data.attachments[0]).not.toHaveProperty("filePath");
        expect(payload.data.topic).not.toHaveProperty("excelFilePath");
        expect(payload.data.recommendQuestions).toHaveLength(1);
        expect(payload.data.excelInfo).toEqual({
            columns: ["name", "score"],
            preview: [
                { name: "Alice", score: "95" },
                { name: "Bob", score: "88" },
            ],
            columnValues: {
                name: ["Alice", "Bob"],
                score: ["95", "88"],
            },
            columnValuesTruncated: [],
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
            message: "实验模板不存在",
        },
    });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(1);
});
