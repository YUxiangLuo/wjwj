import { expect, test } from "bun:test";
import { resolveDevAuthMode } from "./dev-mode";

test("dev auth defaults on in local development", () => {
    expect(resolveDevAuthMode({})).toBe(true);
    expect(resolveDevAuthMode({ NODE_ENV: "development" })).toBe(true);
});

test("dev auth defaults off in test and production", () => {
    expect(resolveDevAuthMode({ NODE_ENV: "test" })).toBe(false);
    expect(resolveDevAuthMode({ NODE_ENV: "production" })).toBe(false);
    expect(resolveDevAuthMode({})).toBe(true);
});

test("DEV_AUTH_MODE only overrides non-production defaults", () => {
    expect(resolveDevAuthMode({ NODE_ENV: "production", DEV_AUTH_MODE: "1" })).toBe(false);
    expect(resolveDevAuthMode({ NODE_ENV: "development", DEV_AUTH_MODE: "0" })).toBe(false);
    expect(resolveDevAuthMode({ NODE_ENV: "test", DEV_AUTH_MODE: "1" })).toBe(true);
});
