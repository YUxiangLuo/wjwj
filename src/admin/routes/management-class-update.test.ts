import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { class_, semester, teacher } from "../../db/schema";
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

test("admin class create locks semester mutations and takes FOR SHARE on semester and teacher inside a transaction", async () => {
    const { db, operations } = createMockDb({
        select: [[{ id: 3 }], [{ id: 5 }]],
        insert: [[{ id: 12 }]],
    });
    mock.module("../../db", () => ({ db }));
    const module = await import(`./management.ts?class-create=${crypto.randomUUID()}`);

    const response = await module.classRoutes.POST!(new Request("https://example.com/api/admin/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "统计一班", semesterId: 3, teacherId: 5 }),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: { id: 12 } });
    expect(operations[0]?.kind).toBe("transaction");
    expect(operations[1]?.kind).toBe("execute");
    const lock = new PgDialect().sqlToQuery(operations[1]!.query as SQL);
    expect(lock.sql).toContain("pg_advisory_xact_lock");
    expect(lock.params).toEqual([0x574a, 0x5345]);
    expect(operations[2]).toMatchObject({ kind: "select", table: semester, lockStrength: "share" });
    expect(operations[3]).toMatchObject({ kind: "select", table: teacher, lockStrength: "share" });
    expect(operations[4]).toMatchObject({ kind: "insert", table: class_, values: { name: "统计一班", semesterId: 3, teacherId: 5 } });
});

test("admin class create returns 404 without inserting if semester or teacher was concurrently deleted", async () => {
    for (const selectQueue of [[[], [{ id: 5 }]], [[{ id: 3 }], []]]) {
        const { db, operations } = createMockDb({ select: selectQueue });
        mock.module("../../db", () => ({ db }));
        const module = await import(`./management.ts?class-create-missing=${crypto.randomUUID()}`);

        const response = await module.classRoutes.POST!(new Request("https://example.com/api/admin/classes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "统计一班", semesterId: 3, teacherId: 5 }),
        }));

        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND", message: "学期或教师不存在" } });
        expect(operations.some((op) => op.kind === "insert")).toBe(false);
    }
});
