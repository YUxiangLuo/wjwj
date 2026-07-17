import { migrate } from "drizzle-orm/bun-sql/migrator";
import { closeDatabase, db } from "./index";

async function main() {
    console.log("Running migrations...");

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
