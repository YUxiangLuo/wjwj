import { expect, test } from "bun:test";
import { isValidEmail, isValidOptionalEmail } from "./email";

test("email validation accepts normal addresses and rejects malformed values", () => {
    expect(isValidEmail("student@example.edu")).toBe(true);
    expect(isValidEmail(" student@example.edu ")).toBe(true);
    expect(isValidEmail("wrong-email")).toBe(false);
    expect(isValidEmail("student@ example.edu")).toBe(false);
});

test("optional email validation accepts a blank value", () => {
    expect(isValidOptionalEmail("")).toBe(true);
    expect(isValidOptionalEmail("   ")).toBe(true);
    expect(isValidOptionalEmail("wrong-email")).toBe(false);
});
