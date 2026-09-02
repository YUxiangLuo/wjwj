import { expect, test } from "bun:test";
import { generateTemporaryPassword } from "./temporary-password";

test("temporary passwords are readable, random, and include every required character class", () => {
    const values = new Set(Array.from({ length: 20 }, () => generateTemporaryPassword()));
    expect(values.size).toBe(20);
    for (const value of values) {
        expect(value).toHaveLength(12);
        expect(value).toMatch(/[A-Z]/);
        expect(value).toMatch(/[a-z]/);
        expect(value).toMatch(/[2-9]/);
        expect(value).toMatch(/[!@#$%]/);
        expect(value).not.toMatch(/[0O1Il]/);
    }
});
