import { expect, mock, test } from "bun:test";
import { createMockDb } from "../../test-utils/mock-db";

test("title-only update leaves the currently stored body untouched", async () => {
    const { db, operations } = createMockDb({ update: [[{ id: 9 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?announcement=${crypto.randomUUID()}`);
    const request = Object.assign(new Request("https://example.com/api/admin/announcements/9", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "新标题", status: 0 }),
    }), { params: { id: "9" } });
    const response = await module.announcementUpdateRoutes.PUT!(request);
    expect(response.status).toBe(200);
    expect(operations.find(operation => operation.kind === "update")?.set).toEqual({ title: "新标题", status: 0, updatedAt: expect.any(Date) });
});

test.each(["<p>   </p>", "<p><br></p>", "<p>&nbsp;</p>"])("announcement rejects blank visible body %s on create and update", async content => {
    const { db, operations } = createMockDb({ insert: [[{ id: 9 }]], update: [[{ id: 9 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?announcement=${crypto.randomUUID()}`);
    for (const method of ["POST", "PUT"] as const) {
        const request = Object.assign(new Request("https://example.com/api/admin/announcements/9", {
            method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "标题", content }),
        }), { params: { id: "9" } });
        const response = await (method === "POST" ? module.announcementRoutes.POST! : module.announcementUpdateRoutes.PUT!)(request);
        expect(response.status).toBe(400);
    }
    expect(operations).toHaveLength(0);
});

test.each(["publish", "update"])("%s refuses publishing an existing blank draft", async action => {
    const { db, operations } = createMockDb({ select: [[{ content: "<p>&nbsp;</p>" }]], update: [[{ id: 9 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?announcement=${crypto.randomUUID()}`);
    const request = Object.assign(new Request("https://example.com/api/admin/announcements/9", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: 1 }),
    }), { params: { id: "9" } });
    const response = await (action === "publish" ? module.announcementPublishRoutes : module.announcementUpdateRoutes).PUT!(request);
    expect(response.status).toBe(400);
    expect(operations.some(operation => operation.kind === "update")).toBe(false);
});

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
