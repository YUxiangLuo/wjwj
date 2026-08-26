import { sql, type SQL } from "drizzle-orm";

export const MAX_SAMPLING_ATTEMPTS_PER_EXPERIMENT = 100;

type SqlExecutor = {
    execute(query: SQL): PromiseLike<unknown>;
};

/** Keep the audit table bounded to the same recent history exposed to teachers. */
export async function trimSamplingAttempts(
    executor: SqlExecutor,
    experimentId: number,
    limit = MAX_SAMPLING_ATTEMPTS_PER_EXPERIMENT,
) {
    const normalizedLimit = Math.max(1, Math.floor(limit));
    await executor.execute(sql`
        DELETE FROM sampling_attempt
        WHERE experiment_id = ${experimentId}
          AND id NOT IN (
              SELECT id
              FROM sampling_attempt
              WHERE experiment_id = ${experimentId}
              ORDER BY created_at DESC, id DESC
              LIMIT ${normalizedLimit}
          )
    `);
}
