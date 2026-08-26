import { expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { MAX_SAMPLING_ATTEMPTS_PER_EXPERIMENT, trimSamplingAttempts } from "./sampling-attempt-retention";

test("sampling attempt retention keeps only the newest bounded history", async () => {
    let query: Parameters<PgDialect["sqlToQuery"]>[0] | undefined;
    await trimSamplingAttempts({
        execute(value) {
            query = value;
            return Promise.resolve([]);
        },
    }, 42);

    expect(MAX_SAMPLING_ATTEMPTS_PER_EXPERIMENT).toBe(100);
    const compiled = new PgDialect().sqlToQuery(query!);
    expect(compiled.sql).toContain("DELETE FROM sampling_attempt");
    expect(compiled.sql).toContain("ORDER BY created_at DESC, id DESC");
    expect(compiled.params).toEqual([42, 42, 100]);
});
