import type { Config } from "drizzle-kit";

function requireEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export default {
    schema: "./src/db/schema.ts",
    out: "./drizzle",
    dialect: "mysql",
    dbCredentials: {
        host: requireEnv("DB_HOST"),
        user: requireEnv("DB_USER"),
        password: requireEnv("DB_PASSWORD"),
        database: requireEnv("DB_NAME"),
    },
} satisfies Config;
