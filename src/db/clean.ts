/**
 * Database Reset Script
 * 
 * WARNING: This removes this project's current and legacy tables.
 */

import { closeDatabase, db } from "./index";
import { sql } from "drizzle-orm";
import { validateDatabaseConfirmation } from "./destructive-confirmation";

const PROJECT_TABLES = [
    "audit_event",
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
    "sampling_attempt",
    "research_analysis_run",
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
    const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
    const confirmationError = validateDatabaseConfirmation(databaseUrl, process.env.CONFIRM_DATABASE_NAME);
    if (confirmationError) throw new Error(confirmationError);

    console.log("🗑️  已确认目标数据库名，开始删除 sampling-vlab 表...");

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
