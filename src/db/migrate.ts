import { migrate } from "drizzle-orm/bun-sql/migrator";
import { sql } from "drizzle-orm";
import { closeDatabase, db } from "./index";

async function main() {
    console.log("Running migrations...");

    const [state] = await db.execute(sql`
        SELECT
            to_regclass('public.submission')::text AS legacy_submission,
            to_regclass('public.admin')::text AS app_table,
            to_regclass('drizzle.__drizzle_migrations')::text AS migration_table
    `) as Array<{ legacy_submission: string | null; app_table: string | null; migration_table: string | null }>;

    if (state?.legacy_submission) {
        throw new Error(
            "检测到简化前的数据库结构，不能直接套用新的基线迁移。请先备份数据；确认允许清空后运行 bun run db:reset。",
        );
    }
    if (state?.app_table && !state.migration_table) {
        throw new Error(
            "检测到已有应用表但没有 Drizzle 迁移记录。为避免覆盖现有数据，请改用空数据库，或备份后运行 bun run db:reset。",
        );
    }

    await migrate(db, { migrationsFolder: "drizzle/postgresql" });

    console.log("Migrations completed!");
}

try {
    await main();
} catch (err) {
    console.error("Migration failed!", err);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
