import { sql, type SQL } from "drizzle-orm";
import { customType } from "drizzle-orm/pg-core";

export type JsonDocument = Record<string, unknown> | unknown[];

function isJsonDocument(value: unknown): value is JsonDocument {
    if (Array.isArray(value)) return true;
    if (value === null || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

export function encodeNativeJsonDocument(value: unknown): JsonDocument {
    if (!isJsonDocument(value)) {
        throw new TypeError("JSONB document must be a plain object or array");
    }

    // Detect circular references, BigInt values, and other inputs JSON cannot represent.
    JSON.stringify(value);
    return value;
}

export function decodeNativeJsonDocument(value: unknown): unknown {
    if (typeof value !== "string") return value;

    try {
        return JSON.parse(value);
    } catch {
        // Keep transitional reads non-destructive. parseStoredJson remains the
        // application boundary that turns malformed historical values into null.
        return value;
    }
}

/**
 * Compare a JSONB expression with an observed application value while treating
 * a missing key, SQL NULL, and JSON null as the same empty state. Bun SQL binds
 * a JavaScript null as SQL NULL, so both sides must be normalized before using
 * equality or the predicate can never match an initially empty value.
 */
export function jsonbNullSafeEquals(expression: SQL, observedValue: JsonDocument | null) {
    return sql`coalesce(${expression}, 'null'::jsonb) = coalesce(${observedValue}::jsonb, 'null'::jsonb)`;
}

/**
 * Drizzle's stock PostgreSQL jsonb column stringifies values before handing
 * them to Bun SQL. Bun SQL already accepts native objects/arrays, so that
 * extra conversion stores a JSON string inside jsonb. This codec intentionally
 * passes documents through and only decodes the historical string shape.
 */
export const nativeJsonb = customType<{ data: unknown; driverData: unknown }>({
    dataType() {
        return "jsonb";
    },
    toDriver(value) {
        return encodeNativeJsonDocument(value);
    },
    fromDriver(value) {
        return decodeNativeJsonDocument(value);
    },
});
