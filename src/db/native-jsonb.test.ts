import { expect, test } from "bun:test";
import {
    decodeNativeJsonDocument,
    encodeNativeJsonDocument,
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
