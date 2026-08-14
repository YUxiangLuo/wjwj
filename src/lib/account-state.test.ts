import { expect, test } from "bun:test";
import { getAccountState, matchesAccountState } from "./account-state";

const now = Date.parse("2026-08-14T12:00:00.000Z");

test("account state gives disabled status precedence over a temporary lock", () => {
    expect(getAccountState(0, "2026-08-14T12:15:00.000Z", now)).toBe("disabled");
});

test("account state reports only active future lockouts as locked", () => {
    expect(getAccountState(1, "2026-08-14T12:15:00.000Z", now)).toBe("locked");
    expect(getAccountState(1, "2026-08-14T12:00:00.000Z", now)).toBe("normal");
    expect(getAccountState(1, "2026-08-14T11:59:59.000Z", now)).toBe("normal");
    expect(getAccountState(1, null, now)).toBe("normal");
    expect(getAccountState(1, "invalid", now)).toBe("normal");
});

test("account state filters keep locked accounts out of the normal set", () => {
    const lockedUntil = "2026-08-14T12:15:00.000Z";
    expect(matchesAccountState(1, lockedUntil, "all", now)).toBe(true);
    expect(matchesAccountState(1, lockedUntil, "locked", now)).toBe(true);
    expect(matchesAccountState(1, lockedUntil, "normal", now)).toBe(false);
    expect(matchesAccountState(1, null, "normal", now)).toBe(true);
    expect(matchesAccountState(0, lockedUntil, "disabled", now)).toBe(true);
    expect(matchesAccountState(0, lockedUntil, "locked", now)).toBe(false);
});
