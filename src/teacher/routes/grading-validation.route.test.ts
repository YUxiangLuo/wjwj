import { expect, mock, test } from "bun:test";
import { experiment } from "../../db/schema";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function post(id: string, body: unknown) {
    const request = new Request("https://example.com", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    (request as Request & { params?: Record<string, string> }).params = { id };
    return request;
}

async function load(row: Record<string, unknown>, update?: unknown[]) {
    const { db, operations } = createMockDb({ select: [[row], [{ id: 3 }]], update });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./grading.ts?validation=${crypto.randomUUID()}`);
    return { module, operations };
}

const baseRow = {
    id: 99,
    version: 7,
    status: "submitted",
    studentClassId: 3,
    taskClassId: 3,
    weightConfig: { questionnaire: 30, process: 30, report: 40 },
    submissionSnapshot: null,
};

const validScores = { scoreQuestionnaire: 80, scoreProcess: 90, scoreReport: 100 };

test("grading rejects scores outside 0-100 or missing before any write", async () => {
    const invalid = [
        { ...validScores, scoreQuestionnaire: -1 },
        { ...validScores, scoreProcess: 101 },
        { ...validScores, scoreReport: Number.NaN },
        { scoreQuestionnaire: 80, scoreProcess: 90 },
    ];

    for (const scores of invalid) {
        const { module, operations } = await load(baseRow);
        const response = await module.gradingDetailRoutes.POST!(post("99", { observedVersion: 7, ...scores }));
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
        expect(operations.some((operation) => operation.kind === "update")).toBe(false);
    }
});

test("grading rejects a malformed or oversized comment", async () => {
    for (const comment of [42, "长".repeat(2001)]) {
        const { module, operations } = await load(baseRow);
        const response = await module.gradingDetailRoutes.POST!(post("99", { observedVersion: 7, ...validScores, comment }));
        expect(response.status).toBe(400);
        expect(operations.some((operation) => operation.kind === "update")).toBe(false);
    }
});

test("grading rejects a submission that is still in progress", async () => {
    const { module, operations } = await load({ ...baseRow, status: "in_progress" });

    const response = await module.gradingDetailRoutes.POST!(post("99", { observedVersion: 7, ...validScores }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_STATUS" } });
    expect(operations.some((operation) => operation.kind === "update")).toBe(false);
});

test("grading falls back to the template weights when the snapshot has none", async () => {
    const { module, operations } = await load(baseRow);

    const response = await module.gradingDetailRoutes.POST!(post("99", { observedVersion: 7, ...validScores }));
    const payload = await response.json() as { data: { totalScore: number } };

    // 0.3*80 + 0.3*90 + 0.4*100 = 91
    expect(response.status).toBe(200);
    expect(payload.data.totalScore).toBe(91);
    const update = operations.find((operation) => operation.kind === "update" && operation.table === experiment);
    expect(update?.set).toMatchObject({ totalScore: "91.00" });
});
