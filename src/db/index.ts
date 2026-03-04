import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

function requireEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

// Create the connection pool
const poolConnection = mysql.createPool({
    host: requireEnv("DB_HOST"),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

export const db = drizzle(poolConnection, { schema, mode: "default" });
