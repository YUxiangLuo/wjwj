import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

async function loadManageService(options: {
    select?: unknown[];
    insert?: unknown[];
    update?: unknown[];
} = {}) {
    const { db, operations } = createMockDb(options);
    mock.module("../../db", () => ({ db }));

    const module = await import("./manage-service");
    return { module, operations };
}

test("createTeacherTopic rejects direct publish before configuration", async () => {
    const { module, operations } = await loadManageService();
    const result = await module.createTeacherTopic({
        teacherId: 9,
        name: "抽样设计课题",
        status: 1,
    });

    expect(result).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        message: "课题需先上传总体数据后才能发布",
        status: 400,
    });
    expect(operations).toHaveLength(0);
});

test("topic basics reject non-string descriptions before touching the database", async () => {
    const { module, operations } = await loadManageService();

    expect(await module.createTeacherTopic({
        teacherId: 9,
        name: "抽样设计课题",
        description: {} as never,
    })).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(await module.updateTeacherTopicBasics({
        teacherId: 9,
        topicId: 12,
        body: { description: [] as never },
    })).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(operations).toHaveLength(0);
});

test("updateTeacherTopicBasics rejects publishing an incomplete topic", async () => {
    const { module, operations } = await loadManageService({
        select: [[{
            excelFilePath: null,
            fieldMapping: null,
            weightConfig: null,
        }]],
    });

    const result = await module.updateTeacherTopicBasics({
        teacherId: 9,
        topicId: 12,
        body: { status: 1 },
    });

    expect(result).toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        message: "课题需先上传总体数据后才能发布",
        status: 400,
    });
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);
});

test("updateTeacherTopicBasics allows publishing a fully configured topic", async () => {
    const { module, operations } = await loadManageService({
        select: [[{
            excelFilePath: "/storage/uploads/topic.xlsx",
            fieldMapping: { identifier: "id", stratified: ["gender"], numeric: ["score"], analysisTarget: { kind: "mean", field: "score" } },
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        }]],
    });

    const result = await module.updateTeacherTopicBasics({
        teacherId: 9,
        topicId: 12,
        body: { status: 1 },
    });

    expect(result).toEqual({ ok: true });
    const updates = operations.filter((operation) => operation.kind === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.set).toMatchObject({ status: 1, updatedAt: expect.any(Date) });
});

test("assigned topic basics remain immutable after the mutation lock is acquired", async () => {
    const { module, operations } = await loadManageService({
        select: [[{
            excelFilePath: "/storage/uploads/topic.xlsx",
            fieldMapping: { identifier: "id", stratified: ["gender"], numeric: ["score"] },
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        }], [{ id: 7 }]],
    });

    const result = await module.updateTeacherTopicBasics({
        teacherId: 9,
        topicId: 12,
        body: { name: "发布后改名" },
    });

    expect(result).toMatchObject({
        ok: false,
        code: "TOPIC_ASSIGNED",
        status: 409,
    });
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);
});

test("soft deleting an unassigned topic removes its population and attachment files", async () => {
    const populationPath = `/storage/delete-topic-${crypto.randomUUID()}.csv`;
    const attachmentPath = `/storage/delete-topic-${crypto.randomUUID()}.pdf`;
    await Bun.write(`${process.cwd()}${populationPath}`, "id\n1\n");
    await Bun.write(`${process.cwd()}${attachmentPath}`, "%PDF-1.4\n");
    const { module, operations } = await loadManageService({
        update: [[{ id: 12, excelFilePath: populationPath }], [{ id: 1 }]],
        select: [[{ filePath: attachmentPath }], []],
    });

    try {
        expect(await module.softDeleteTeacherTopic({ teacherId: 9, topicId: 12 })).toEqual({ ok: true });
        expect(await Bun.file(`${process.cwd()}${populationPath}`).exists()).toBe(false);
        expect(await Bun.file(`${process.cwd()}${attachmentPath}`).exists()).toBe(false);
        expect(operations.some((operation) => operation.kind === "delete")).toBe(true);
    } finally {
        await Bun.file(`${process.cwd()}${populationPath}`).delete().catch(() => undefined);
        await Bun.file(`${process.cwd()}${attachmentPath}`).delete().catch(() => undefined);
    }
});

test("assigned topics cannot be deleted and retain files needed by historical compact samples", async () => {
    const populationPath = `/storage/delete-assigned-${crypto.randomUUID()}.csv`;
    const attachmentPath = `/storage/delete-assigned-${crypto.randomUUID()}.pdf`;
    await Bun.write(`${process.cwd()}${populationPath}`, "id\n1\n");
    await Bun.write(`${process.cwd()}${attachmentPath}`, "%PDF-1.4\n");
    const { module, operations } = await loadManageService({
        update: [[{ id: 12, excelFilePath: populationPath }], [{ id: 1 }]],
        select: [[{ filePath: attachmentPath }], [{ id: 7 }]],
    });

    try {
        expect(await module.softDeleteTeacherTopic({ teacherId: 9, topicId: 12 })).toEqual({
            ok: false,
            code: "TOPIC_ASSIGNED",
            message: "已分配任务的课题不能删除",
            status: 403,
        });
        expect(await Bun.file(`${process.cwd()}${populationPath}`).exists()).toBe(true);
        expect(await Bun.file(`${process.cwd()}${attachmentPath}`).exists()).toBe(true);
        expect(operations.some((operation) => operation.kind === "delete")).toBe(false);
    } finally {
        await Bun.file(`${process.cwd()}${populationPath}`).delete().catch(() => undefined);
        await Bun.file(`${process.cwd()}${attachmentPath}`).delete().catch(() => undefined);
    }
});

test("soft deleting a topic advances task update metadata with the deletion time", async () => {
    const { module, operations } = await loadManageService();

    expect(await module.softDeleteTeacherTopic({ teacherId: 9, topicId: 12 })).toEqual({ ok: true });

    const updates = operations.filter((operation) => operation.kind === "update");
    expect(updates).toHaveLength(2);
    const topicValues = updates[0]?.set as { deletedAt?: Date; updatedAt?: Date };
    const taskValues = updates[1]?.set as { deletedAt?: Date; updatedAt?: Date };
    expect(topicValues.updatedAt).toBe(topicValues.deletedAt);
    expect(taskValues.deletedAt).toBe(topicValues.deletedAt);
    expect(taskValues.updatedAt).toBe(topicValues.deletedAt);
});
