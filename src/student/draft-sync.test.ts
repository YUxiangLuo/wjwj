import { describe, expect, test } from "bun:test";
import { hasUnsavedChanges } from "./draft-sync";

describe("hasUnsavedChanges", () => {
    test("compares current and server values correctly", () => {
        expect(hasUnsavedChanges("current", "server")).toBe(true);
        expect(hasUnsavedChanges("same", "same")).toBe(false);
        expect(hasUnsavedChanges("", "")).toBe(false);
        expect(hasUnsavedChanges("content", "")).toBe(true);
        expect(hasUnsavedChanges("", "content")).toBe(true);
    });
});
