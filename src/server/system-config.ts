import { eq } from "drizzle-orm";
import { db } from "../db";
import { systemConfig } from "../db/schema";

interface NumericConfigRow {
    value: string;
    valueType: string;
}

export function parseConfigNumber(row: NumericConfigRow | null | undefined, fallback: number) {
    if (!row) return fallback;
    if (row.valueType === "number") return Number(row.value);
    if (row.valueType === "boolean") return row.value === "true" ? 1 : 0;

    const parsed = Number(row.value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getConfigNumber(key: string, fallback: number) {
    const [row] = await db
        .select({ value: systemConfig.configValue, valueType: systemConfig.valueType })
        .from(systemConfig)
        .where(eq(systemConfig.configKey, key))
        .limit(1);

    return parseConfigNumber(row, fallback);
}
