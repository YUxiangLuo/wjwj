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

async function load(row: Record<string, unknown>, update?: unknown[], owned = true) {
    const { db, operations } = createMockDb({ select: [[row], owned ? [{ id: 3 }] : []], update });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?post=${crypto.randomUUID()}`);
    return { module, operations };
}

const row = {
    id: 99,
    version: 7,
    status: "submitted",
    studentClassId: 3,
    taskClassId: 3,
    weightConfig: { questionnaire: 30, process: 30, report: 40 },
    submissionSnapshot: { weightConfig: { questionnaire: 50, process: 20, report: 30 } },
};

test("grading rejects excess precision in every component without writes", async () => {
    for (const key of ["scoreQuestionnaire", "scoreProcess", "scoreReport"]) {
        const { module, operations } = await load(row);
        const response = await module.gradingDetailRoutes.POST!(post("99", {
            observedVersion: 7, scoreQuestionnaire: 1, scoreProcess: 2, scoreReport: 3, [key]: 1.005,
        }));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR", message: "分项分数最多保留两位小数" } });
        expect(operations.some(item => item.kind === "update" || item.kind === "insert")).toBe(false);
    }
});

test("grading rounds an unequal frozen-weight half-cent total up consistently", async () => {
    const { module, operations } = await load(row);
    const response = await module.gradingDetailRoutes.POST!(post("99", {
        observedVersion: 7, scoreQuestionnaire: 1.01, scoreProcess: 1, scoreReport: 1,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { totalScore: 1.01 } });
    expect(operations.find(item => item.kind === "update" && item.table === experiment)?.set)
        .toMatchObject({ scoreQuestionnaire: "1.01", scoreProcess: "1", scoreReport: "1", totalScore: "1.01", version: 8 });
    expect(operations.find(item => item.kind === "insert")?.values).toMatchObject({ details: { totalScore: 1.01 } });
});

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

for (const action of ["grade", "reject"] as const) {
    test(`${action} refuses a class transferred before the write transaction`, async () => {
        const { module, operations } = await load(row, undefined, false);
        const response = action === "grade"
            ? await module.gradingDetailRoutes.POST!(post("99", { observedVersion: 7, scoreQuestionnaire: 80, scoreProcess: 90, scoreReport: 100 }))
            : await module.gradingRejectRoutes.POST!(post("99", { observedVersion: 7, reason: "请补充抽样结果分析" }));
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
        expect(operations.some(op => op.kind === "update" || op.kind === "insert")).toBe(false);
    });
}

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
