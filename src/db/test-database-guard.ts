import type { SQL } from "bun";

/**
 * The DB-backed suites talk to whatever TEST_DATABASE_URL points at, and a stale
 * local database used to fail deep inside a query with "relation/column does not
 * exist", which reads like a schema-contract regression. Fail early instead and
 * say what to do.
 */
export async function assertTestDatabaseIsMigrated(sql: SQL, label = "TEST_DATABASE_URL") {
    const [state] = await sql`
        SELECT
            to_regclass('public.student')::text AS students,
            to_regclass('public.experiment')::text AS experiments,
            to_regclass('drizzle.__drizzle_migrations')::text AS migrations
    ` as Array<{ students: string | null; experiments: string | null; migrations: string | null }>;

    if (!state?.students || !state?.experiments || !state?.migrations) {
        throw new Error(
            `${label} 指向的数据库尚未迁移（缺少 student/experiment 表或 drizzle 迁移记录）。`
            + `请先运行：DATABASE_URL="$TEST_DATABASE_URL" bun run db:migrate（或指向一个空的测试库）。`,
        );
    }

    const journal = await Bun.file("drizzle/postgresql/meta/_journal.json").json() as { entries?: Array<{ when?: number }> };
    const expected = (journal.entries ?? []).map((entry) => Number(entry.when));
    const rows = await sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY id` as Array<{ created_at: number | string }>;
    const applied = rows.map((row) => Number(row.created_at));
    const isPrefix = applied.length > 0
        && applied.length <= expected.length
        && applied.every((timestamp, index) => timestamp === expected[index]);
    if (!isPrefix) {
        throw new Error(
            `${label} 指向的数据库迁移历史与当前代码不一致（已应用 ${applied.length} / 预期 ${expected.length}）。`
            + `请运行：DATABASE_URL="$TEST_DATABASE_URL" bun run db:migrate，或改用一次性测试库。`,
        );
    }
}
