import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

function requireEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const sqlClient = new SQL(requireEnv("DATABASE_URL"));

export const db = drizzle(sqlClient, { schema });

export async function closeDatabase() {
    await sqlClient.close();
}
