import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createMockDb } from "../test-utils/mock-db";
import { userSession } from "../db/schema";

test("session creation bounds expiry cleanup and skips rows locked by other account transactions", async () => {
    const { db, operations } = createMockDb();
    mock.module("../db", () => ({ db }));
    const { createUserSession, SESSION_TTL_MS } = await import(`./user-session.ts?cleanup=${crypto.randomUUID()}`);
    const session = await createUserSession(3, 12);
    const deletion = operations.find(op => op.kind === "delete" && op.table === userSession);
    const query = new PgDialect().sqlToQuery(deletion!.where as SQL);
    expect(query.sql.toLowerCase()).toContain("for update skip locked");
    expect(query.sql.toLowerCase()).toContain("limit 100");
    expect(query.sql).toContain('"user_session"."expires_at"');
    expect(operations.find(op => op.kind === "insert")?.values).toMatchObject({
        userType: 3, userId: 12, sessionToken: session.token, expiresAt: session.expiresAt,
    });
    expect(Math.abs(session.expiresAt.getTime() - Date.now() - SESSION_TTL_MS)).toBeLessThan(1000);
});
