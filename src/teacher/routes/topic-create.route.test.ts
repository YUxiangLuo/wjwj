import { expect, mock, test } from "bun:test";
import { createTeacherAuthModuleMock } from "../../test-utils/mock-auth-modules";
import { createMockDb } from "../../test-utils/mock-db";

async function loadTopicRoutes(options: { select?: unknown[]; insert?: unknown[]; teacherId?: number } = {}) {
    const { db, operations } = createMockDb(options);
    mock.module("../../db", () => ({ db }));
    mock.module("./auth", () => createTeacherAuthModuleMock({
        getPrimaryTeacherIdOrThrow: () => options.teacherId ?? 9,
    }));
    const module = await import("./topic-task");
    return { module, operations };
}

test("creating a topic stores the background description", async () => {
    const { module, operations } = await loadTopicRoutes({ insert: [[{ id: 44 }]] });

    const response = await module.topicRoutes.POST!(new Request("https://example.com/api/teacher/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "联动走查：月消费支出", description: "走查用背景描述：估计月消费支出均值。" }),
    }));
    const payload = await response.json() as { success: boolean; data: { id: number } };

    expect(response.status).toBe(201);
    expect(payload).toEqual({ success: true, data: { id: 44 } });
    const insert = operations.find((operation) => operation.kind === "insert");
    expect(insert?.values).toMatchObject({ teacherId: 9, name: "联动走查：月消费支出", status: 0 });
    expect((insert?.values as { description: string }).description).toContain("走查用背景描述");
});

test("the topic list selection includes the description column", async () => {
    const { module, operations } = await loadTopicRoutes();

    await module.topicRoutes.GET!(new Request("https://example.com/api/teacher/topics"));

    const selection = operations.find((operation) => operation.kind === "select")?.selection as Record<string, unknown> | undefined;
    expect(selection).toBeTruthy();
    expect(Object.keys(selection!)).toContain("description");
});
