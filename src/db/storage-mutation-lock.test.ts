import { expect, mock, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { acquireStorageMutationLock } from "./storage-mutation-lock";

test("storage mutations use the shared transaction-scoped PostgreSQL lock", async () => {
    let captured: SQL | null = null;
    const execute = mock(async (query: SQL) => {
        captured = query;
        return [];
    });

    await acquireStorageMutationLock({ execute });

    expect(execute).toHaveBeenCalledTimes(1);
    const query = new PgDialect().sqlToQuery(captured!);
    expect(query.sql).toContain("pg_advisory_xact_lock");
    expect(query.params).toEqual([0x574a, 0x5354]);
});
