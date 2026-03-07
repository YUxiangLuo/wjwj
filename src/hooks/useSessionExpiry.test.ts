import { expect, test } from "bun:test";
import { DEFAULT_SESSION_WARNING_WINDOW_MS, getSessionTimeoutDelays } from "./useSessionExpiry";

test("getSessionTimeoutDelays returns null for empty or invalid inputs", () => {
    expect(getSessionTimeoutDelays(null)).toBeNull();
    expect(getSessionTimeoutDelays("not-a-date")).toBeNull();
});

test("getSessionTimeoutDelays computes warning and expiry delays from now", () => {
    const now = Date.UTC(2026, 2, 8, 12, 0, 0);
    const expiresAt = new Date(now + 30 * 60 * 1000).toISOString();

    expect(getSessionTimeoutDelays(expiresAt, now)).toEqual({
        warnDelay: 25 * 60 * 1000,
        expireDelay: 30 * 60 * 1000,
    });
});

test("getSessionTimeoutDelays clamps past warning and expiry times to zero", () => {
    const now = Date.UTC(2026, 2, 8, 12, 0, 0);
    const expiresAt = new Date(now - 1_000).toISOString();

    expect(getSessionTimeoutDelays(expiresAt, now, DEFAULT_SESSION_WARNING_WINDOW_MS)).toEqual({
        warnDelay: 0,
        expireDelay: 0,
    });
});