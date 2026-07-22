import { sql, type SQL } from "drizzle-orm";

type SqlExecutor = {
    execute(query: SQL): PromiseLike<unknown>;
};

// Every process that mutates storage takes the same transaction-scoped
// PostgreSQL advisory lock. PostgreSQL releases it automatically on commit,
// rollback, connection loss, or process exit, so a crashed process cannot
// leave a stale filesystem lock behind.
const STORAGE_MUTATION_LOCK_NAMESPACE = 0x574a;
const STORAGE_MUTATION_LOCK_KEY = 0x5354;

export async function acquireStorageMutationLock(executor: SqlExecutor) {
    await executor.execute(sql`
        SELECT pg_advisory_xact_lock(
            ${STORAGE_MUTATION_LOCK_NAMESPACE},
            ${STORAGE_MUTATION_LOCK_KEY}
        )
    `);
}
