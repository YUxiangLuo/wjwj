import { unlink } from "node:fs/promises";
import { expect, mock, test } from "bun:test";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
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
    mock.module("./auth", () => createTeacherAuthModuleMock({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
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

    const recommendQuestions = [
        { id: "q1", type: "single" as const, content: "你最关注哪项指标？", options: [{ id: "o_1", label: "价格" }, { id: "o_2", label: "质量" }] },
    ];
    const analysisTarget = { kind: "mean" as const, field: "score" };
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
                fieldMapping: JSON.stringify({
                    identifier: "id",
                    numeric: ["score"],
                    analysisTarget,
                    studyContract: {
                        version: 1,
                        researchQuestion: "抽样设计课题中score的平均水平是多少？",
                        targetPopulation: "测试总体",
                        unitOfAnalysis: "一行",
                        target: analysisTarget,
                    },
                }),
                weightConfig: JSON.stringify({ questionnaire: 30, process: 40, report: 30 }),
                recommendQuestions,
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
        ],
        insert: [[{ id: 44 }]],
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

        expect(insertOperations).toHaveLength(2);
        expect(insertOperations[0]?.values).toMatchObject({
            teacherId: 9,
            name: "抽样设计课题 (副本)",
            description: "原始课题",
            excelRowCount: 16,
            fieldMapping: {
                identifier: "id",
                numeric: ["score"],
                analysisTarget,
                studyContract: {
                    version: 1,
                    researchQuestion: "抽样设计课题 (副本)中评分的平均水平是多少？",
                    targetPopulation: "测试总体",
                    unitOfAnalysis: "一行",
                    target: analysisTarget,
                },
            },
            weightConfig: { questionnaire: 30, process: 40, report: 30 },
            recommendQuestions,
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
        expect(operations.some((operation) => operation.kind === "execute")).toBe(true);

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
            message: "实验模板不存在",
        },
    });
    expect(operations.filter((operation) => operation.kind === "insert")).toHaveLength(0);
});

test("topic copy truncates a maximum-length source name before adding the suffix", async () => {
    const { module, operations } = await loadTopicRoutes({
        select: [
            [{ id: 12, status: 0 }],
            [{ id: 12, teacherId: 9, name: "长".repeat(200), description: "", excelFilePath: null, excelRowCount: 0, fieldMapping: null, samplingPolicy: null, weightConfig: null, recommendQuestions: null, status: 0 }],
            [],
        ],
        insert: [[{ id: 45 }]],
    });
    const response = await module.topicCopyRoutes.POST!(withRouteParam(new Request("https://example.com", { method: "POST" }), "12"));
    expect(response.status).toBe(200);
    const inserted = operations.find((operation) => operation.kind === "insert");
    expect((inserted?.values as any).name).toHaveLength(200);
    expect((inserted?.values as any).name).toEndWith(" (副本)");
});
