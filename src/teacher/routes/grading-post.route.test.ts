import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { experiment } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function post(id: string, body: unknown) {
    const request = new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function load(row: Record<string, unknown>, update?: unknown[]) {
    const { db, operations } = createMockDb({ select: [[row]], update });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?post=${crypto.randomUUID()}`);
    return { module, operations };
}

const row = {
    id: 99,
    version: 7,
    status: "submitted",
    weightConfig: { questionnaire: 30, process: 30, report: 40 },
    submissionSnapshot: { weightConfig: { questionnaire: 50, process: 20, report: 30 } },
};

test("grading updates the same experiment with weighted scores", async () => {
    const { module, operations } = await load(row);
    const response = await module.gradingDetailRoutes.POST!(post("99", { observedVersion: 7, scoreQuestionnaire: 80, scoreProcess: 90, scoreReport: 100, comment: "完成良好" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { success: true, totalScore: 88 } });
    const update = operations.find((item) => item.kind === "update" && item.table === experiment);
    expect(update?.set).toMatchObject({ status: "graded", version: 8, totalScore: "88.00", teacherComment: "完成良好", gradedByTeacherId: 9 });
    const condition = new PgDialect().sqlToQuery(update!.where as SQL);
    expect(condition.params).toEqual([99, 7, "submitted"]);
});

test("rejecting a submission only changes the current experiment", async () => {
    const { module, operations } = await load(row);
    const response = await module.gradingRejectRoutes.POST!(post("99", { observedVersion: 7, reason: "请补充抽样结果分析" }));
    expect(response.status).toBe(200);
    const update = operations.find((item) => item.kind === "update" && item.table === experiment);
    expect(update?.set).toMatchObject({ status: "rejected", rejectReason: "请补充抽样结果分析", totalScore: null });
    expect(operations.filter((item) => item.kind === "insert")).toHaveLength(1);
});

test("grading returns 409 when a concurrent transition wins first", async () => {
    const { module } = await load(row, [[]]);
    const response = await module.gradingDetailRoutes.POST!(post("99", {
        observedVersion: 7,
        scoreQuestionnaire: 80,
        scoreProcess: 90,
        scoreReport: 100,
        comment: "完成良好",
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
});

test("rejecting returns 409 when a concurrent transition wins first", async () => {
    const { module } = await load(row, [[]]);
    const response = await module.gradingRejectRoutes.POST!(post("99", { observedVersion: 7, reason: "请补充抽样结果分析" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
});

test("grading rejects a stale page before score validation or update", async () => {
    const { module, operations } = await load(row);
    const response = await module.gradingDetailRoutes.POST!(post("99", {
        observedVersion: 6,
        scoreQuestionnaire: -1,
        scoreProcess: -1,
        scoreReport: -1,
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "VERSION_CONFLICT" } });
    expect(operations.filter((item) => item.kind === "update")).toHaveLength(0);
});

test("grading and rejection require a numeric observedVersion", async () => {
    const grade = await load(row);
    const gradeResponse = await grade.module.gradingDetailRoutes.POST!(post("99", {
        observedVersion: "7",
        scoreQuestionnaire: 80,
        scoreProcess: 90,
        scoreReport: 100,
    }));
    expect(gradeResponse.status).toBe(400);
    expect(await gradeResponse.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const rejection = await load(row);
    const rejectResponse = await rejection.module.gradingRejectRoutes.POST!(post("99", {
        observedVersion: null,
        reason: "请补充抽样结果分析",
    }));
    expect(rejectResponse.status).toBe(400);
    expect(await rejectResponse.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
});

const archivedRow = {
    ...row,
    studentDeletedAt: null,
    taskDeletedAt: new Date("2026-08-01T00:00:00Z"),
    topicDeletedAt: null,
};

test("grading an archived submission returns 409 read-only", async () => {
    const { module, operations } = await load(archivedRow);
    const response = await module.gradingDetailRoutes.POST!(post("99", { observedVersion: 7, scoreQuestionnaire: 80, scoreProcess: 90, scoreReport: 100 }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "ARCHIVED_READ_ONLY", message: "该提交已归档，仅供查阅，不能评分" } });
    expect(operations.filter((item) => item.kind === "update")).toHaveLength(0);
});

test("rejecting an archived submission returns 409 read-only", async () => {
    const { module, operations } = await load(archivedRow);
    const response = await module.gradingRejectRoutes.POST!(post("99", { observedVersion: 7, reason: "请补充抽样结果分析" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "ARCHIVED_READ_ONLY" } });
    expect(operations.filter((item) => item.kind === "update")).toHaveLength(0);
});
