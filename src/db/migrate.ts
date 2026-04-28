import { migrate } from "drizzle-orm/bun-sql/migrator";
import { db, sqlClient } from "./index";

async function main() {
    console.log("Running migrations...");

    // This will run migrations on the database, skipping the ones already applied
    await migrate(db, { migrationsFolder: "drizzle-pg" });

    console.log("Migrations completed!");

    await sqlClient.close();
    process.exit(0);
}

main().catch((err) => {
    console.error("Migration failed!", err);
    process.exit(1);
});
