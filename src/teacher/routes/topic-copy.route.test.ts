import { unlink } from "node:fs/promises";
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
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
        requirePrimaryTeacher: async () => ({ teacherId: options.teacherId ?? 9, error: null }),
        notifyStudentsByClassIds: async () => undefined,
        getCurrentUser: async () => ({ id: options.teacherId ?? 9, type: "teacher" }),
        notifyStudentById: async () => undefined,
        isLockExpired: () => true,
        TEACHER_USER_TYPE: 2,
        ASSISTANT_USER_TYPE: 3,
    }));

    const module = await import("./topic-task");
    return { module, operations };
}

test("topic copy duplicates the topic and related resources under the current teacher", async () => {
    const testId = crypto.randomUUID().slice(0, 8);
    const sourceExcelPath = `/storage/uploads/source-copy-test-${testId}.xlsx`;
    const sourceAttachmentPath = `/storage/uploads/guide-copy-test-${testId}.pdf`;
    const sourceExcelAbsolutePath = `${process.cwd()}${sourceExcelPath}`;
    const sourceAttachmentAbsolutePath = `${process.cwd()}${sourceAttachmentPath}`;

    await Bun.write(sourceExcelAbsolutePath, "excel-content");
    await Bun.write(sourceAttachmentAbsolutePath, "attachment-content");

    const { module, operations } = await loadTopicRoutes({
        select: [
            [{ id: 12, status: 0 }],
            [{
                id: 12,
                teacherId: 9,
                name: "抽样设计课题",
                description: "原始课题",
                excelFilePath: sourceExcelPath,
                excelRowCount: 16,
                fieldMapping: JSON.stringify({ identifier: "id" }),
                weightConfig: JSON.stringify({ questionnaire: 30, process: 40, report: 30 }),
                status: 1,
            }],
            [{
                id: 5,
                topicId: 12,
                fileName: "guide.pdf",
                filePath: sourceAttachmentPath,
                fileType: "application/pdf",
                fileSize: 1024,
            }],
            [{
                id: 7,
                topicId: 12,
                questionType: 2,
                content: "你最关注哪项指标？",
                choiceOptions: ["价格", "质量"],
                minSelect: null,
                maxSelect: null,
                scaleMin: null,
                scaleMax: null,
                scaleMinLabel: null,
                scaleMaxLabel: null,
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

    const insertOperations = operations.filter((operation) => operation.kind === "insert");
    const copiedExcelPath = (insertOperations[0]?.values as any)?.excelFilePath as string;
    const copiedAttachmentPath = ((insertOperations[1]?.values as any[])?.[0]?.filePath ?? "") as string;

    try {
        expect(response.status).toBe(200);
        expect(payload).toEqual({ success: true, data: { id: 44 } });

        expect(insertOperations).toHaveLength(3);
        expect(insertOperations[0]?.values).toMatchObject({
            teacherId: 9,
            name: "抽样设计课题 (副本)",
            description: "原始课题",
            excelRowCount: 16,
            fieldMapping: { identifier: "id" },
            weightConfig: { questionnaire: 30, process: 40, report: 30 },
            status: 0,
        });
        expect(copiedExcelPath).toContain("/storage/uploads/");
        expect(copiedExcelPath).not.toBe(sourceExcelPath);
        expect(insertOperations[1]?.values).toEqual([{
            topicId: 44,
            fileName: "guide.pdf",
            filePath: copiedAttachmentPath,
            fileType: "application/pdf",
            fileSize: 1024,
        }]);
        expect(copiedAttachmentPath).toContain("/storage/uploads/");
        expect(copiedAttachmentPath).not.toBe(sourceAttachmentPath);
        expect(insertOperations[2]?.values).toEqual([{
            topicId: 44,
            questionType: 2,
            content: "你最关注哪项指标？",
            choiceOptions: ["价格", "质量"],
            minSelect: null,
            maxSelect: null,
            scaleMin: null,
            scaleMax: null,
            scaleMinLabel: null,
            scaleMaxLabel: null,
            sortOrder: 1,
        }]);

        expect(await Bun.file(`${process.cwd()}${copiedExcelPath}`).text()).toBe("excel-content");
        expect(await Bun.file(`${process.cwd()}${copiedAttachmentPath}`).text()).toBe("attachment-content");
    } finally {
        await unlink(sourceExcelAbsolutePath).catch(() => undefined);
        await unlink(sourceAttachmentAbsolutePath).catch(() => undefined);
        if (copiedExcelPath) {
            await unlink(`${process.cwd()}${copiedExcelPath}`).catch(() => undefined);
        }
        if (copiedAttachmentPath) {
            await unlink(`${process.cwd()}${copiedAttachmentPath}`).catch(() => undefined);
        }
    }
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
