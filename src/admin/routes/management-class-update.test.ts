import { expect, mock, test } from "bun:test";
import { class_ } from "../../db/schema";
import { createMockDb } from "../../test-utils/mock-db";

async function load(suffix: string) {
    const { db, operations } = createMockDb({ select: [[{ id: 7 }]], update: [[{ id: 7 }]] });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?class-update=${suffix}`);
    return { module, operations };
}

function classUpdateRequest(body: Record<string, unknown>) {
    const request = new Request("https://example.com/api/admin/classes/7", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return Object.assign(request, { params: { id: "7" } });
}

test("admin class update renames the class and ignores any teacher reassignment", async () => {
    const { module, operations } = await load(crypto.randomUUID());

    const response = await module.classUpdateRoutes.PUT!(classUpdateRequest({ name: "统计二班", teacherId: 99 }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { success: true } });
    const update = operations.find((operation) => operation.kind === "update" && operation.table === class_);
    expect(update?.set).toMatchObject({ name: "统计二班" });
    // Class ownership is fixed at creation time; there is no route that can move
    // a class to another teacher, so stale clients cannot smuggle one in.
    expect(update?.set).not.toHaveProperty("teacherId");
    // No teacher lookup happens because the field is not read at all.
    expect(operations.filter((operation) => operation.kind === "select")).toHaveLength(0);
});

test("admin class update still validates the name", async () => {
    const { module, operations } = await load(crypto.randomUUID());

    const response = await module.classUpdateRoutes.PUT!(classUpdateRequest({ name: "  " }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(operations.some((operation) => operation.kind === "update")).toBe(false);
});
