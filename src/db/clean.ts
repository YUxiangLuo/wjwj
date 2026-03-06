/**
 * Database Reset Script
 * 
 * WARNING: This will DROP ALL TABLES in the database.
 * Only use in development environment!
 */

import { db } from "./index";
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

    // Disable foreign key checks temporarily
    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 0`);

    // Get all table names
    const tables = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_type = 'BASE TABLE'
    `);

    // Drop each table
    const result = (tables as unknown as [Array<{ table_name?: string; TABLE_NAME?: string }>])[0];
    for (const row of result) {
        const tableName = row.table_name || row.TABLE_NAME;
        if (!tableName) continue;
        console.log(`  Dropping table: ${tableName}`);
        await db.execute(sql.raw(`DROP TABLE IF EXISTS \`${tableName}\``));
    }

    // Re-enable foreign key checks
    await db.execute(sql`SET FOREIGN_KEY_CHECKS = 1`);

    console.log("\n✅ All tables dropped.");
    process.exit(0);
}

reset().catch((err) => {
    console.error("❌ Reset failed:", err);
    process.exit(1);
});
