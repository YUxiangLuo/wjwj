import { expect, mock, test } from "bun:test";
import { topic } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

async function loadContentService(queues: Parameters<typeof createMockDb>[0] = {}) {
    const { db, operations } = createMockDb(queues);
    mock.module("../../db", () => ({ db }));
    const module = await import(`./content-service.ts?content=${crypto.randomUUID()}`);
    return { module, operations };
}

test("attachment upload rejects an empty file before touching the database", async () => {
    const { module, operations } = await loadContentService();

    const result = await module.uploadTopicAttachment({ teacherId: 9, topicId: 12, file: new File([], "") });

    expect(result).toMatchObject({ ok: false, code: "INVALID_FILE" });
    expect(operations).toHaveLength(0);
});

test("attachment upload rejects content that does not match the extension", async () => {
    const { module, operations } = await loadContentService();

    const result = await module.uploadTopicAttachment({
        teacherId: 9,
        topicId: 12,
        file: new File([new Uint8Array([1, 2, 3])], "guide.pdf"),
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_FILE" });
    expect(operations).toHaveLength(0);
});

test("recommend questions reject a non-array payload instead of clearing the list", async () => {
    const { module, operations } = await loadContentService();

    for (const items of [undefined, "not-an-array", { 0: "q" }]) {
        const result = await module.replaceTopicRecommendQuestions({ teacherId: 9, topicId: 12, items });
        expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    }
    expect(operations).toHaveLength(0);
});

test("recommend questions reject more than thirty items before opening a transaction", async () => {
    const { module, operations } = await loadContentService();
    const tooMany = Array.from({ length: 31 }, (_, index) => ({
        id: `q${index}`,
        type: "single" as const,
        content: "题目",
        options: [{ id: "o_1", label: "A" }, { id: "o_2", label: "B" }],
    }));

    const result = await module.replaceTopicRecommendQuestions({ teacherId: 9, topicId: 12, items: tooMany });

    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(operations).toHaveLength(0);
});

test("deleting a missing attachment reports not found without deleting a row", async () => {
    const { module, operations } = await loadContentService({ select: [[{ id: 12 }], [], []] });

    const result = await module.deleteTopicAttachment({ teacherId: 9, topicId: 12, attachmentId: 5 });

    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(operations.some((operation) => operation.kind === "delete")).toBe(false);
});

test("copying a topic that is not owned reports not found", async () => {
    const { module, operations } = await loadContentService({ select: [[]] });

    const result = await module.copyTopicWithResources({ teacherId: 9, topicId: 12 });

    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(operations.some((operation) => operation.kind === "insert")).toBe(false);
});

test("copying truncates a 200-character name while keeping the copy suffix", async () => {
    const longName = "长".repeat(200);
    const sourceTopic = {
        id: 12,
        teacherId: 9,
        name: longName,
        description: "描述",
        excelFilePath: null,
        excelRowCount: 30,
        fieldMapping: null,
        samplingPolicy: null,
        weightConfig: null,
        recommendQuestions: null,
        status: 1,
    };
    const { module, operations } = await loadContentService({ select: [[sourceTopic], []], insert: [[{ id: 44 }]] });

    const result = await module.copyTopicWithResources({ teacherId: 9, topicId: 12 });

    expect(result).toEqual({ ok: true, id: 44 });
    const insert = operations.find((operation) => operation.kind === "insert" && operation.table === topic);
    const name = (insert?.values as { name: string }).name;
    expect(name.endsWith(" (副本)")).toBe(true);
    expect(Array.from(name).length).toBeLessThanOrEqual(200);
    expect(name.startsWith("长")).toBe(true);
});
