import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("announcement edit applies content and requested status in one update", async () => {
    const { db, operations } = createMockDb({ update: [[{ id: 9 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?announcement=${crypto.randomUUID()}`);
    const request = Object.assign(new Request("https://example.com/api/admin/announcements/9", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "更新后的公告", content: "更新后的内容", targetScope: "student", status: 0 }),
    }), { params: { id: "9" } });

    const response = await module.announcementUpdateRoutes.PUT!(request);

    expect(response.status).toBe(200);
    const update = operations.find((item) => item.kind === "update");
    expect(update?.set).toMatchObject({
        title: "更新后的公告",
        content: "更新后的内容",
        targetScope: "student",
        status: 0,
        updatedAt: expect.any(Date),
    });
});
