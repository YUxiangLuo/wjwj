import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createMockDb } from "../../test-utils/mock-db";

function request(method: string, body?: unknown) {
    const req = new Request("https://example.com", {
        method, headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    (req as Request & { params: Record<string, string> }).params = { id: "2" };
    return req;
}

for (const action of ["create", "current", "delete"] as const) {
    test(`${action} semester takes the shared transaction lock before reading mutable state`, async () => {
        const { db, operations } = createMockDb({ select: action === "create" ? [[]] : [[{ id: 2, isCurrent: 0 }], [{ count: 0 }]] });
        mock.module("../../db", () => ({ db }));
        const routes = await import(`./management.ts?semester=${crypto.randomUUID()}`);
        const response = action === "create"
            ? await routes.semesterRoutes.POST!(request("POST", { name: "新学期", setAsCurrent: true }))
            : action === "current"
                ? await routes.semesterCurrentRoutes.PUT!(request("PUT"))
                : await routes.semesterDeleteRoutes.DELETE!(request("DELETE"));
        expect(response.status).toBe(action === "create" ? 201 : 200);
        expect(operations[0]?.kind).toBe("transaction");
        expect(operations[1]?.kind).toBe("execute");
        const lock = new PgDialect().sqlToQuery(operations[1]!.query as SQL);
        expect(lock.sql).toContain("pg_advisory_xact_lock");
        expect(lock.params).toEqual([0x574a, 0x5345]);
        expect(operations[2]?.kind).toBe("select");
    });
}

test("a missing target semester never clears the current semester", async () => {
    const { db, operations } = createMockDb({ select: [[]] });
    mock.module("../../db", () => ({ db }));
    const { semesterCurrentRoutes } = await import(`./management.ts?semester=${crypto.randomUUID()}`);
    expect((await semesterCurrentRoutes.PUT!(request("PUT"))).status).toBe(404);
    expect(operations.some(op => op.kind === "update")).toBe(false);
});

test("deleting a semester rechecks the current flag under the transaction lock", async () => {
    const { db, operations } = createMockDb({ select: [[{ id: 2, isCurrent: 1 }]] });
    mock.module("../../db", () => ({ db }));
    const { semesterDeleteRoutes } = await import(`./management.ts?semester=${crypto.randomUUID()}`);
    const response = await semesterDeleteRoutes.DELETE!(request("DELETE"));
    expect(await response.json()).toMatchObject({ error: { code: "CURRENT_SEMESTER_PROTECTED" } });
    expect(operations[0]?.kind).toBe("transaction");
    expect(operations.some(op => op.kind === "delete")).toBe(false);
});
