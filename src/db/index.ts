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

function envNumber(name: string, fallback: number) {
    const value = process.env[name]?.trim();
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid numeric environment variable: ${name}`);
    }
    return parsed;
}

// Create the PostgreSQL connection pool using Bun's native SQL client.
const sqlClient = new SQL({
    adapter: "postgres",
    hostname: requireEnv("DB_HOST"),
    port: envNumber("DB_PORT", 5432),
    username: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    max: 10,
});

export const db = drizzle(sqlClient, { schema });
export { sqlClient };
