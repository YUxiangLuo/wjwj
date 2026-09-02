import { expect, mock, test } from "bun:test";
import { auditEvent, experiment, task } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

async function load(select: unknown[], update: unknown[] = []) {
    const { db, operations } = createMockDb({ select, update });
    mock.module("../../db", () => ({ db }));
    const module = await import(`../topic/task-service.ts?task=${crypto.randomUUID()}`);
    return { module, operations };
}

test("task publish requires a topic and at least one class", async () => {
    const { module, operations } = await load([]);
    expect(await module.publishTopicTasks({ teacherId: 9, topicId: 12, classIds: [] })).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(operations).toHaveLength(0);
});

test("task publish rejects malformed runtime field types before querying", async () => {
    const { module, operations } = await load([]);
    const invalidInputs = [
        { teacherId: 9, topicId: "12", classIds: [101] },
        { teacherId: 9, topicId: 12, classIds: "101" },
        { teacherId: 9, topicId: 12, classIds: [101], deadline: {} },
    ];

    for (const input of invalidInputs) {
        expect(await module.publishTopicTasks(input as never)).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    }
    expect(operations).toHaveLength(0);
});

test("task publish rejects duplicate class IDs before taking the mutation lock", async () => {
    const { module, operations } = await load([]);
    expect(await module.publishTopicTasks({ teacherId: 9, topicId: 12, classIds: [101, 101] })).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
    });
    expect(operations).toHaveLength(0);
});

test("task publish creates one task per newly selected class without notifications", async () => {
    const { module, operations } = await load([
        [{ id: 12, name: "抽样课题", status: 1, excelFilePath: "/storage/topic.xlsx", fieldMapping: { identifier: "id", stratified: ["组"], numeric: ["值"], analysisTarget: { kind: "mean", field: "值" } }, weightConfig: { questionnaire: 30, process: 30, report: 40 } }],
        [{ id: 101 }, { id: 102 }],
        [],
    ]);
    const result = await module.publishTopicTasks({ teacherId: 9, topicId: 12, classIds: [101, 102], deadline: new Date(Date.now() + 86_400_000).toISOString() });
    expect(result).toEqual({ ok: true, skipped: [] });
    const insert = operations.find((item) => item.kind === "insert" && item.table === task);
    expect(insert?.values).toEqual([
        expect.objectContaining({ topicId: 12, classId: 101 }),
        expect.objectContaining({ topicId: 12, classId: 102 }),
    ]);
    expect(operations.some((item) => item.kind === "transaction")).toBe(true);
    expect(operations[0]?.kind).toBe("transaction");
    expect(operations[1]?.kind).toBe("execute");
    expect(operations.findIndex((item) => item.kind === "select")).toBeGreaterThan(1);
});

test("task publish skips an existing task instead of reviving state", async () => {
    const { module, operations } = await load([
        [{ id: 12, name: "抽样课题", status: 1, excelFilePath: "/storage/topic.xlsx", fieldMapping: { identifier: "id", stratified: ["组"], numeric: ["值"], analysisTarget: { kind: "mean", field: "值" } }, weightConfig: { questionnaire: 30, process: 30, report: 40 } }],
        [{ id: 101 }],
        [{ classId: 101 }],
    ]);

    const result = await module.publishTopicTasks({
        teacherId: 9,
        topicId: 12,
        classIds: [101],
        deadline: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(result).toEqual({ ok: true, skipped: [101] });
    expect(operations.some((item) => item.kind === "update" || item.kind === "insert")).toBe(false);
});

test("task deadline extension performs one direct update", async () => {
    const oldDeadline = new Date(Date.now() + 86_400_000);
    const newDeadline = new Date(Date.now() + 172_800_000);
    const { module, operations } = await load([[{ id: 88, classId: 101, deadline: oldDeadline }]]);
    expect(await module.extendTopicTaskDeadline({ teacherId: 9, taskId: 88, deadline: newDeadline.toISOString() })).toEqual({ ok: true });
    const update = operations.find((item) => item.kind === "update" && item.table === task);
    expect(update?.set).toMatchObject({ deadline: newDeadline, updatedAt: expect.any(Date) });
    expect(operations.some((item) => item.kind === "delete")).toBe(false);
});

test("task deadline extension rejects non-string runtime values", async () => {
    const { module, operations } = await load([]);
    expect(await module.extendTopicTaskDeadline({ teacherId: 9, taskId: 88, deadline: {} } as never)).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
    });
    expect(operations).toHaveLength(0);
});

test("task hard deletion removes related audit events and the task row", async () => {
    const { module, operations } = await load([[{ id: 88 }], [{ id: 91 }, { id: 92 }]]);

    expect(await module.deleteTeacherTask({ teacherId: 9, taskId: 88 })).toEqual({ ok: true });

    const deletedTables = operations.filter((item) => item.kind === "delete").map((item) => item.table);
    expect(deletedTables).toContain(auditEvent);
    expect(deletedTables).toContain(task);
    expect(operations.some((item) => item.kind === "select" && item.table === experiment)).toBe(true);
    expect(operations.some((item) => item.kind === "update")).toBe(false);
});
