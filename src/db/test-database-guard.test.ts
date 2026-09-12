import { expect, test } from "bun:test";
import type { SQL } from "bun";
import { assertTestDatabaseIsMigrated } from "./test-database-guard";

function connection(timestamps: number[]): SQL {
    let query = 0;
    return (async () => ++query === 1
        ? [{ students: "student", experiments: "experiment", migrations: "drizzle.__drizzle_migrations" }]
        : timestamps.map(created_at => ({ created_at }))) as unknown as SQL;
}
test("database tests require all increments, not merely a compatible old prefix", async () => {
    const journal = await Bun.file("drizzle/postgresql/meta/_journal.json").json();
    const expected = journal.entries.map((entry: { when: number }) => entry.when);
    await expect(assertTestDatabaseIsMigrated(connection(expected))).resolves.toBeUndefined();
    for (const applied of [[], expected.slice(0, -1), [...expected, 1], [1]]) {
        await expect(assertTestDatabaseIsMigrated(connection(applied))).rejects.toThrow("迁移历史与当前代码不一致");
    }
});
