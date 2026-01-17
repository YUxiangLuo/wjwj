import { migrate } from "drizzle-orm/mysql2/migrator";
import { db } from "./index";
import mysql from "mysql2/promise";

async function main() {
    console.log("Running migrations...");

    // This will run migrations on the database, skipping the ones already applied
    await migrate(db, { migrationsFolder: "drizzle" });

    console.log("Migrations completed!");

    // Close the connection pool
    // Accessing the internal pool is not directly exposed by drizzle instance usually, 
    // so we might rely on the script ending or explicit pool export if needed.
    // In `src/db/index.ts`, we didn't export the pool.
    // But Bun's process.exit should handle it.
    process.exit(0);
}

main().catch((err) => {
    console.error("Migration failed!", err);
    process.exit(1);
});
