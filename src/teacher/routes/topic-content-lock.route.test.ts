import { expect, mock, test } from "bun:test";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

function withTopicId(request: Request, id = "12") {
    (request as Request & { params: Record<string, string> }).params = { id };
    return request;
}

async function loadRoutes(select: unknown[]) {
    const { db, operations } = createMockDb({ select });
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock());
    const module = await import(`./topic-task.ts?content-lock=${crypto.randomUUID()}`);
    return { module, operations };
}

test("assigned topic basics are rejected before an update starts", async () => {
    const { module, operations } = await loadRoutes([[{ id: 12, status: 1, hasTasks: true }]]);
    const response = await module.topicItemRoutes.PUT!(withTopicId(new Request(
        "https://example.com/api/teacher/topics/12",
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "发布后改名" }),
        },
    )));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "TOPIC_ASSIGNED" } });
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);
});

test("assignment committed after the route check still blocks recommended-question changes", async () => {
    const { module, operations } = await loadRoutes([
        [{ id: 12, status: 1, hasTasks: false }],
        [{ id: 12 }],
        [{ id: 99 }],
    ]);
    const response = await module.topicRecommendQuestionRoutes.PUT!(withTopicId(new Request(
        "https://example.com/api/teacher/topics/12/recommend-questions",
        {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: [] }),
        },
    )));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "TOPIC_ASSIGNED" } });
    expect(operations.filter((operation) => operation.kind === "update")).toHaveLength(0);
});

test("topic item handlers reject non-finite IDs before querying", async () => {
    const { module, operations } = await loadRoutes([]);

    const updateResponse = await module.topicItemRoutes.PUT!(withTopicId(new Request(
        "https://example.com/api/teacher/topics/Infinity",
        { method: "PUT" },
    ), "Infinity"));
    const deleteResponse = await module.topicItemRoutes.DELETE!(withTopicId(new Request(
        "https://example.com/api/teacher/topics/1e309",
        { method: "DELETE" },
    ), "1e309"));

    expect(updateResponse.status).toBe(400);
    expect(deleteResponse.status).toBe(400);
    expect(await updateResponse.json()).toMatchObject({ error: { code: "INVALID_ID" } });
    expect(await deleteResponse.json()).toMatchObject({ error: { code: "INVALID_ID" } });
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(0);
});
