import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
    decodeNativeJsonDocument,
    encodeNativeJsonDocument,
    jsonbNullSafeEquals,
} from "./native-jsonb";

test("native JSONB codec passes objects and arrays to Bun SQL without stringifying", () => {
    const object = { nested: { ok: true } };
    const array = [{ id: 1 }];

    expect(encodeNativeJsonDocument(object)).toBe(object);
    expect(encodeNativeJsonDocument(array)).toBe(array);
});

test("native JSONB codec decodes the historical JSON-string shape", () => {
    expect(decodeNativeJsonDocument('{"nested":{"ok":true}}')).toEqual({
        nested: { ok: true },
    });
    expect(decodeNativeJsonDocument('[{"id":1}]')).toEqual([{ id: 1 }]);
});

test("native JSONB codec rejects top-level primitives and unsupported objects", () => {
    expect(() => encodeNativeJsonDocument('{"still":"a string"}')).toThrow();
    expect(() => encodeNativeJsonDocument(null)).toThrow();
    expect(() => encodeNativeJsonDocument(new Date())).toThrow();
});

test("JSONB optimistic comparisons normalize a JavaScript null on both sides", () => {
    const query = new PgDialect().sqlToQuery(
        jsonbNullSafeEquals(sql.raw("observed_result"), null),
    );

    expect(query.sql).toBe(
        "coalesce(observed_result, 'null'::jsonb) = coalesce($1::jsonb, 'null'::jsonb)",
    );
    expect(query.params).toEqual([null]);
});
