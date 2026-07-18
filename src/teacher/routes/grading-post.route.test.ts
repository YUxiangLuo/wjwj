import { expect, mock, test } from "bun:test";
import { experiment } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

function post(id: string, body: unknown) {
    const request = new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function load(row: Record<string, unknown>) {
    const { db, operations } = createMockDb({ select: [[row]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({ getTeacherUser: () => ({ id: 9, type: "teacher", name: "教师", employeeId: "T001" }) }));
    const module = await import(`./grading.ts?post=${crypto.randomUUID()}`);
    return { module, operations };
}

const row = {
    id: 99,
    status: "submitted",
    weightConfig: { questionnaire: 30, process: 30, report: 40 },
    submissionSnapshot: { weightConfig: { questionnaire: 50, process: 20, report: 30 } },
};

test("grading updates the same experiment with weighted scores", async () => {
    const { module, operations } = await load(row);
    const response = await module.gradingDetailRoutes.POST!(post("99", { scoreQuestionnaire: 80, scoreProcess: 90, scoreReport: 100, comment: "完成良好" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { success: true, totalScore: 88 } });
    const update = operations.find((item) => item.kind === "update" && item.table === experiment);
    expect(update?.set).toMatchObject({ status: "graded", totalScore: "88.00", teacherComment: "完成良好", gradedByTeacherId: 9 });
});

test("rejecting a submission only changes the current experiment", async () => {
    const { module, operations } = await load(row);
    const response = await module.gradingRejectRoutes.POST!(post("99", { reason: "请补充抽样结果分析" }));
    expect(response.status).toBe(200);
    const update = operations.find((item) => item.kind === "update" && item.table === experiment);
    expect(update?.set).toMatchObject({ status: "rejected", rejectReason: "请补充抽样结果分析", totalScore: null });
    expect(operations.filter((item) => item.kind === "insert")).toHaveLength(0);
});
