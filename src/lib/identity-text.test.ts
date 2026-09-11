import { expect, test } from "bun:test";
import { identityKey, normalizeIdentityText } from "./identity-text";

test("full-width and half-width identifiers share one comparison key", () => {
    expect(identityKey("Ｓ2601")).toBe(identityKey("S2601"));
    expect(identityKey("２６０１")).toBe(identityKey("2601"));
    expect(identityKey("s2601")).toBe(identityKey("S2601"));
    expect(identityKey("  S2601\u3000")).toBe(identityKey("S2601"));
});

test("stored identity keeps its own case but drops width and padding", () => {
    expect(normalizeIdentityText("  Ｓ2601  ")).toBe("S2601");
    expect(normalizeIdentityText("s2601")).toBe("s2601");
    expect(normalizeIdentityText("T00１")).toBe("T001");
});

test("different identifiers stay different", () => {
    expect(identityKey("S2601")).not.toBe(identityKey("S2602"));
    expect(identityKey("S2601")).not.toBe(identityKey("P2601"));
});
