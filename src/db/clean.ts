/**
 * Database Reset Script
 * 
 * WARNING: This will DROP ALL TABLES in the database.
 * Only use in development environment!
 */

import { closeDatabase, db } from "./index";
import { sql } from "drizzle-orm";

function quoteIdentifier(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
}

async function reset() {
    const args = process.argv.slice(2);
    const force = args.includes("--force") || args.includes("-f");

    if (!force) {
        console.log("⚠️  WARNING: This will DROP ALL TABLES in the database!");
        console.log("Run with --force or -f to confirm.\n");
        console.log("Usage: bun run db:clean");
        console.log("Or:    bun run db:reset");
        process.exit(1);
    }

    console.log("🗑️  Dropping all tables...\n");

    const tables = await db.execute(sql`
        SELECT schemaname, tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
    `);

    for (const row of tables as Array<{ schemaname: string; tablename: string }>) {
        console.log(`  Dropping table: ${row.tablename}`);
        await db.execute(sql.raw(
            `DROP TABLE IF EXISTS ${quoteIdentifier(row.schemaname)}.${quoteIdentifier(row.tablename)} CASCADE`
        ));
    }

    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);

    console.log("\n✅ All tables dropped.");
}

try {
    await reset();
} catch (err) {
    console.error("❌ Reset failed:", err);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
