import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { readStoredDocument } from "../lib/stored-document";
import { PgDialect } from "drizzle-orm/pg-core";
import {
    encodeNativeJsonDocument,
    jsonbNullSafeEquals,
} from "./native-jsonb";

test("native JSONB codec passes objects and arrays to Bun SQL without stringifying", () => {
    const object = { nested: { ok: true } };
    const array = [{ id: 1 }];

    expect(encodeNativeJsonDocument(object)).toBe(object);
    expect(encodeNativeJsonDocument(array)).toBe(array);
});

test("native JSONB reads reject JSON-string shapes rather than decode them", () => {
    expect(() => readStoredDocument('{"nested":{"ok":true}}')).toThrow("JSONB 存储格式无效");
    expect(() => readStoredDocument('[{"id":1}]')).toThrow("JSONB 存储格式无效");
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
