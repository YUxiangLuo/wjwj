import { expect, test } from "bun:test";
import { parseConfigNumber } from "./system-config";

test("parseConfigNumber returns number config values directly", () => {
    expect(parseConfigNumber({ value: "45", valueType: "number" }, 10)).toBe(45);
});

test("parseConfigNumber converts boolean values to numeric flags", () => {
    expect(parseConfigNumber({ value: "true", valueType: "boolean" }, 10)).toBe(1);
    expect(parseConfigNumber({ value: "false", valueType: "boolean" }, 10)).toBe(0);
});

test("parseConfigNumber falls back on invalid string values", () => {
    expect(parseConfigNumber({ value: "not-a-number", valueType: "string" }, 10)).toBe(10);
    expect(parseConfigNumber(null, 10)).toBe(10);
});
