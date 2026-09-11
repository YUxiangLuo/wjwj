import { expect, test } from "bun:test";
import { isNumericText, parseNumericText } from "./numeric-text";

test("accepts the numeric shapes a spreadsheet export produces", () => {
    expect(parseNumericText(42)).toBe(42);
    expect(parseNumericText("42")).toBe(42);
    expect(parseNumericText(" 42.5 ")).toBe(42.5);
    expect(parseNumericText("-3")).toBe(-3);
    expect(parseNumericText("+3")).toBe(3);
    expect(parseNumericText(".5")).toBe(0.5);
    expect(parseNumericText("1e-6")).toBeCloseTo(0.000001, 12);
    expect(parseNumericText("全角１２３")).toBeNull();
    expect(parseNumericText("１２３")).toBe(123);
    expect(parseNumericText("1,234")).toBe(1234);
    expect(parseNumericText("1,234,567.5")).toBe(1234567.5);
});

test("rejects blanks and non-numeric text", () => {
    for (const value of [null, undefined, "", "   ", "abc", "12abc", "1,23", "1.2.3", "１２３元", {}, []]) {
        expect(isNumericText(value)).toBe(false);
    }
});
