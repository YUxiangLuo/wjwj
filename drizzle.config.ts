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
    out: "./drizzle/postgresql",
    dialect: "postgresql",
    dbCredentials: {
        url: requireEnv("DATABASE_URL"),
    },
} satisfies Config;
