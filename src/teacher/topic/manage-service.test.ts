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
            fieldMapping: { identifier: "id", stratified: ["gender"], numeric: ["score"] },
            weightConfig: { questionnaire: 30, process: 30, report: 40 },
        }]],
    });

    const result = await module.updateTeacherTopicBasics({
        teacherId: 9,
        topicId: 12,
        body: { status: 1 },
    });

    expect(result).toEqual({ ok: true });
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(1);
});
