import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createMockDb } from "../test-utils/mock-db";

async function fixture(role: "student" | "teacher" | "admin", active = true) {
    const userType = role === "student" ? 3 : role === "teacher" ? 2 : 1;
    const { db, operations } = createMockDb({ select: active ? [[{
        sessionToken: "token-a", userType, userId: 11, expiresAt: new Date(Date.now() + 60_000),
    }]] : [[]] });
    mock.module("../db", () => ({ db }));
    const module = await import(`./user-session.ts?boundaries=${crypto.randomUUID()}`);
    return { module, operations, userType };
}
for (const role of ["student", "teacher", "admin"] as const) {
    test(`${role} logout revokes only its token without a late cookie mutation`, async () => {
        const { module, operations, userType } = await fixture(role);
        const response = await module.logoutUserSession(new Request(`https://example.com/api/${role}/logout`, {
            method: "POST", headers: { cookie: `${role}_session=token-a`, "X-Expected-User-Id": "11" },
        }), `${role}_session`, userType);
        expect(response.status).toBe(200);
        expect(response.headers.has("set-cookie")).toBe(false);
        const deletions = operations.filter(op => op.kind === "delete");
        expect(deletions).toHaveLength(1);
        expect(new PgDialect().sqlToQuery(deletions[0]!.where as SQL).params).toEqual(["token-a"]);
    });
    test(`${role} logout remains idempotent for an already revoked cookie`, async () => {
        const { module, operations, userType } = await fixture(role, false);
        const response = await module.logoutUserSession(new Request(`https://example.com/api/${role}/logout`, {
            method: "POST", headers: { cookie: `${role}_session=revoked-token` },
        }), `${role}_session`, userType);
        expect(response.status).toBe(200);
        expect(response.headers.has("set-cookie")).toBe(false);
        expect(operations.some(op => op.kind === "delete")).toBe(false);
    });
}
test("an identity URL never authenticates without a cookie", async () => {
    const { module, operations, userType } = await fixture("student");
    const result = await module.loadActiveUserSession(new Request("https://example.com/api/student/file?expected_user_id=11"), "student_session", [userType]);
    expect(result.session).toBeNull();
    expect(result.failure).toBe("missing_token");
    expect(operations).toHaveLength(0);
});
for (const second of ["11", "22"]) {
    test(`every repeated URL identity constraint is checked: 11 and ${second}`, async () => {
        const { module, userType } = await fixture("student");
        const result = await module.loadActiveUserSession(new Request(`https://example.com/api/student/file?expected_user_id=11&expected_user_id=${second}`, {
            headers: { cookie: "student_session=token-a" },
        }), "student_session", [userType]);
        expect(result.failure).toBe(second === "11" ? null : "identity_changed");
    });
}
for (const [query, header, expectedFailure] of [
    ["11", null, null], ["22", null, "identity_changed"],
    ["22", "11", "identity_changed"], ["11", "22", "identity_changed"],
    [null, null, null], ["", null, "identity_changed"],
] as const) {
    test(`resource identity query=${query} header=${header}`, async () => {
        const { module, operations, userType } = await fixture("student");
        const url = new URL("https://example.com/api/student/attachments/1/download");
        if (query !== null) url.searchParams.set("expected_user_id", query);
        const headers = new Headers({ cookie: "student_session=token-a" });
        if (header !== null) headers.set("X-Expected-User-Id", header);
        const result = await module.loadActiveUserSession(new Request(url, { headers }), "student_session", [userType]);
        expect(result.failure).toBe(expectedFailure);
        expect(operations.every(op => op.kind === "select")).toBe(true);
    });
}
