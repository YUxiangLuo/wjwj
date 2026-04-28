/**
 * Database Reset Script
 * 
 * WARNING: This will DROP ALL TABLES in the database.
 * Only use in development environment!
 */

import { db, sqlClient } from "./index";
import { sql } from "drizzle-orm";

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

    // Get all table names
    const tables = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
    `);

    // Drop each table
    const rows = Array.isArray(tables)
        ? tables as Array<{ table_name?: string }>
        : [];
    for (const row of rows) {
        const tableName = row.table_name;
        if (!tableName) continue;
        console.log(`  Dropping table: ${tableName}`);
        await db.execute(sql.raw(`DROP TABLE IF EXISTS "${tableName.replace(/"/g, '""')}" CASCADE`));
    }

    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);

    console.log("\n✅ All tables dropped.");
    await sqlClient.close();
    process.exit(0);
}

reset().catch((err) => {
    console.error("❌ Reset failed:", err);
    process.exit(1);
});
