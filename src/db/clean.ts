/**
 * Database Reset Script
 * 
 * WARNING: This removes this project's current and legacy tables.
 */

import { closeDatabase, db } from "./index";
import { sql } from "drizzle-orm";

const PROJECT_TABLES = [
    "announcement_read",
    "assistant_class",
    "student_transfer",
    "system_metrics",
    "topic_attachment",
    "user_session",
    "submission",
    "login_log",
    "notification",
    "operation_log",
    "system_config",
    "assistant",
    "experiment",
    "student",
    "task",
    "topic",
    "class",
    "semester",
    "teacher",
    "announcement",
    "admin",
] as const;

async function reset() {
    const args = process.argv.slice(2);
    const force = args.includes("--force") || args.includes("-f");

    if (!force) {
        console.log("⚠️  WARNING: This will drop all sampling-vlab tables!");
        console.log("Run with --force or -f to confirm.\n");
        console.log("Usage: bun run db:clean");
        console.log("Or:    bun run db:reset");
        process.exit(1);
    }

    console.log("🗑️  Dropping sampling-vlab tables...\n");

    for (const tableName of PROJECT_TABLES) {
        console.log(`  Dropping table: ${tableName}`);
        await db.execute(sql.raw(`DROP TABLE IF EXISTS public."${tableName}" CASCADE`));
    }

    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);

    console.log("\n✅ Project tables dropped; unrelated public tables were left untouched.");
}

try {
    await reset();
} catch (err) {
    console.error("❌ Reset failed:", err);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
