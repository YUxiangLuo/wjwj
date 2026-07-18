import { expect, mock, test } from "bun:test";
import { topic } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

function request(id: string) {
    const value = new Request("https://example.com/api/teacher/topics/12/weights", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightConfig: { questionnaire: 40, process: 35, report: 25 } }),
    });
    (value as Request & { params: Record<string, string> }).params = { id };
    return value;
}

async function load(status: number) {
    const { db, operations } = createMockDb({ select: [[{ id: 12, status, excelFilePath: null }]] });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => ({ getPrimaryTeacherIdOrThrow: () => 9 }));
    const module = await import(`./topic-task.ts?weights=${crypto.randomUUID()}`);
    return { module, operations };
}

test("published topic weights are immutable", async () => {
    const { module, operations } = await load(1);
    const response = await module.topicWeightRoutes.PUT!(request("12"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(operations.some((operation) => operation.kind === "update")).toBe(false);
});

test("draft topic weights can still be configured", async () => {
    const { module, operations } = await load(0);
    const response = await module.topicWeightRoutes.PUT!(request("12"));
    expect(response.status).toBe(200);
    const update = operations.find((operation) => operation.kind === "update" && operation.table === topic);
    expect(update?.set).toEqual({ weightConfig: { questionnaire: 40, process: 35, report: 25 } });
});
