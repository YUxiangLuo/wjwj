import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

function withRouteParam(request: Request, id: string) {
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function loadTopicRoutes(options: {
    select?: unknown[];
    insert?: unknown[];
    teacherId?: number;
} = {}) {
    const { db, operations } = createMockDb(options);

    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({
        requirePrimaryTeacher: async () => ({ teacherId: options.teacherId ?? 9, error: null }),
        notifyStudentsByClassIds: async () => undefined,
    }));

    const module = await import("./topic-task");
    return { module, operations };
}

test("topic copy duplicates the topic and related resources under the current teacher", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [
            [{ id: 12, status: 0 }],
            [{
                id: 12,
                teacherId: 9,
                name: "抽样设计课题",
                description: "原始课题",
                excelFilePath: "/storage/uploads/source.xlsx",
                excelRowCount: 16,
                fieldMapping: { identifier: "id" },
                weightConfig: { questionnaire: 30, process: 40, report: 30 },
                status: 1,
            }],
            [{
                id: 5,
                topicId: 12,
                fileName: "guide.pdf",
                filePath: "/storage/uploads/guide.pdf",
                fileType: "application/pdf",
                fileSize: 1024,
            }],
            [{
                id: 7,
                topicId: 12,
                questionType: 2,
                content: "你最关注哪项指标？",
                options: "价格,质量",
                sortOrder: 1,
            }],
        ],
        insert: [[{ insertId: 44 }]],
    });

    const request = withRouteParam(new Request("https://example.com/api/teacher/topics/12/copy", {
        method: "POST",
    }), "12");

    const response = await module.topicCopyRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ success: true, data: { id: 44 } });

    const insertOperations = operations.filter((operation) => operation.kind === "insert");
    expect(insertOperations).toHaveLength(3);
    expect(insertOperations[0]?.values).toMatchObject({
        teacherId: 9,
        name: "抽样设计课题 (副本)",
        description: "原始课题",
        excelFilePath: "/storage/uploads/source.xlsx",
        excelRowCount: 16,
        status: 0,
    });
    expect(insertOperations[1]?.values).toEqual([{
        topicId: 44,
        fileName: "guide.pdf",
        filePath: "/storage/uploads/guide.pdf",
        fileType: "application/pdf",
        fileSize: 1024,
    }]);
    expect(insertOperations[2]?.values).toEqual([{
        topicId: 44,
        questionType: 2,
        content: "你最关注哪项指标？",
        options: "价格,质量",
        sortOrder: 1,
    }]);
});

test("topic copy returns 404 when the teacher does not own the topic", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [[]],
    });

    const request = withRouteParam(new Request("https://example.com/api/teacher/topics/12/copy", {
        method: "POST",
    }), "12");

    const response = await module.topicCopyRoutes.POST!(request);
    const payload = await response.json() as any;

    expect(response.status).toBe(404);
    expect(payload).toEqual({
        success: false,
        error: {
            code: "NOT_FOUND",
            message: "课题不存在",
        },
    });
    expect(operations.filter((operation) => operation.kind === "insert")).toHaveLength(0);
});
