import type { Config } from "drizzle-kit";

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

export default {
    schema: "./src/db/schema.ts",
    out: "./drizzle-pg",
    dialect: "postgresql",
    dbCredentials: {
        host: requireEnv("DB_HOST"),
        port: envNumber("DB_PORT", 5432),
        user: requireEnv("DB_USER"),
        password: requireEnv("DB_PASSWORD"),
        database: requireEnv("DB_NAME"),
        ssl: false,
    },
} satisfies Config;
