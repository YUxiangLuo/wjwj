import { expect, mock, test } from "bun:test";
import { auditEvent, topic } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";
import { buildDefaultSamplingPolicy } from "../../lib/sampling-policy";

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
        message: "实验模板需先上传总体数据后才能发布",
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
        message: "实验模板需先上传总体数据后才能发布",
        status: 400,
    });
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);
});

test("updateTeacherTopicBasics allows publishing a fully configured topic", async () => {
    const populationPath = `/storage/uploads/publish-ready-${crypto.randomUUID()}.csv`;
    await Bun.write(`${process.cwd()}${populationPath}`, "id,gender,score\n1,A,10\n2,B,20\n");
    const { module, operations } = await loadManageService({
        select: [[{
            excelFilePath: populationPath,
            fieldMapping: { identifier: "id", stratified: ["gender"], numeric: ["score"], analysisTarget: { kind: "mean", field: "score" } },
            samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled: false }),
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        }]],
    });

    try {
        const result = await module.updateTeacherTopicBasics({
            teacherId: 9,
            topicId: 12,
            body: { status: 1 },
        });

        expect(result).toEqual({ ok: true });
        const updates = operations.filter((operation) => operation.kind === "update");
        expect(updates).toHaveLength(1);
        expect(updates[0]?.set).toMatchObject({ status: 1, updatedAt: expect.any(Date) });
    } finally {
        await Bun.file(`${process.cwd()}${populationPath}`).delete().catch(() => undefined);
    }
});

test("field mapping derives method capabilities for categorical and two-column studies", async () => {
    const categoricalPath = `/storage/uploads/categorical-${crypto.randomUUID()}.csv`;
    const meanPath = `/storage/uploads/two-column-${crypto.randomUUID()}.csv`;
    await Bun.write(`${process.cwd()}${categoricalPath}`, "id,group,response\n1,A,yes\n2,B,no\n");
    await Bun.write(`${process.cwd()}${meanPath}`, "id,value\n1,10\n2,20\n");
    const { module, operations } = await loadManageService({
        select: [
            [{ excelFilePath: categoricalPath, status: 0 }],
            [],
            [{ excelFilePath: meanPath, status: 0 }],
            [],
        ],
    });

    try {
        expect(await module.updateTopicFieldMapping({
            teacherId: 9,
            topicId: 12,
            fieldMapping: {
                identifier: "id",
                stratified: ["group", "response"],
                numeric: [],
                analysisTarget: { kind: "proportion", field: "response", value: "yes" },
            },
        })).toEqual({ ok: true });
        expect(await module.updateTopicFieldMapping({
            teacherId: 9,
            topicId: 13,
            fieldMapping: {
                identifier: "id",
                stratified: [],
                numeric: ["value"],
                analysisTarget: { kind: "mean", field: "value" },
            },
        })).toEqual({ ok: true });

        const updates = operations.filter((operation) => operation.kind === "update");
        expect(updates[0]?.set).toMatchObject({
            samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled: false }),
        });
        expect(updates[1]?.set).toMatchObject({
            samplingPolicy: buildDefaultSamplingPolicy({ ppsEnabled: false, stratifiedEnabled: false }),
        });
    } finally {
        await Bun.file(`${process.cwd()}${categoricalPath}`).delete().catch(() => undefined);
        await Bun.file(`${process.cwd()}${meanPath}`).delete().catch(() => undefined);
    }
});

test("renaming a topic retitles only its generated study-contract question", async () => {
    const target = { kind: "mean" as const, field: "score" };
    const { module, operations } = await loadManageService({
        select: [[{
            name: "原课题",
            excelFilePath: "/storage/uploads/topic.xlsx",
            fieldMapping: {
                identifier: "id",
                stratified: ["gender"],
                numeric: ["score"],
                analysisTarget: target,
                studyContract: {
                    version: 1,
                    researchQuestion: "原课题中score的平均水平是多少？",
                    targetPopulation: "测试总体",
                    unitOfAnalysis: "一行",
                    target,
                },
            },
            weightConfig: { questionnaire: 30, process: 40, report: 30 },
        }], []],
    });

    expect(await module.updateTeacherTopicBasics({
        teacherId: 9,
        topicId: 12,
        body: { name: "新课题" },
    })).toEqual({ ok: true });

    const update = operations.find((operation) => operation.kind === "update");
    expect(update?.set).toMatchObject({
        name: "新课题",
        fieldMapping: {
            studyContract: { researchQuestion: "新课题中score的平均水平是多少？" },
        },
    });
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

test("hard deleting an unassigned topic removes its row, audit events, population, and attachment files", async () => {
    const populationPath = `/storage/delete-topic-${crypto.randomUUID()}.csv`;
    const attachmentPath = `/storage/delete-topic-${crypto.randomUUID()}.pdf`;
    await Bun.write(`${process.cwd()}${populationPath}`, "id\n1\n");
    await Bun.write(`${process.cwd()}${attachmentPath}`, "%PDF-1.4\n");
    const { module, operations } = await loadManageService({
        select: [
            [{ id: 12, excelFilePath: populationPath }],
            [{ id: 1, filePath: attachmentPath }],
            [],
        ],
    });

    try {
        expect(await module.deleteTeacherTopic({ teacherId: 9, topicId: 12 })).toEqual({ ok: true });
        expect(await Bun.file(`${process.cwd()}${populationPath}`).exists()).toBe(false);
        expect(await Bun.file(`${process.cwd()}${attachmentPath}`).exists()).toBe(false);
        const deletedTables = operations.filter((operation) => operation.kind === "delete").map((operation) => operation.table);
        expect(deletedTables).toContain(auditEvent);
        expect(deletedTables).toContain(topic);
    } finally {
        await Bun.file(`${process.cwd()}${populationPath}`).delete().catch(() => undefined);
        await Bun.file(`${process.cwd()}${attachmentPath}`).delete().catch(() => undefined);
    }
});

test("assigned topics cannot be deleted and retain their files", async () => {
    const populationPath = `/storage/delete-assigned-${crypto.randomUUID()}.csv`;
    const attachmentPath = `/storage/delete-assigned-${crypto.randomUUID()}.pdf`;
    await Bun.write(`${process.cwd()}${populationPath}`, "id\n1\n");
    await Bun.write(`${process.cwd()}${attachmentPath}`, "%PDF-1.4\n");
    const { module, operations } = await loadManageService({
        select: [
            [{ id: 12, excelFilePath: populationPath }],
            [{ id: 1, filePath: attachmentPath }],
            [{ id: 7 }],
        ],
    });

    try {
        expect(await module.deleteTeacherTopic({ teacherId: 9, topicId: 12 })).toEqual({
            ok: false,
            code: "TOPIC_ASSIGNED",
            message: "已分配实验任务的模板不能删除",
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
