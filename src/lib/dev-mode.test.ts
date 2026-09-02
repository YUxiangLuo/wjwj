import { expect, test } from "bun:test";
import {
    DEV_ADMIN_PASSWORD,
    DEV_ADMIN_USERNAME,
    DEV_STUDENT_ID,
    DEV_STUDENT_PASSWORD,
    DEV_TEACHER_ID,
    DEV_TEACHER_PASSWORD,
    resolveDevAuthMode,
} from "./dev-mode";

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

test("dev demo accounts and passwords match the default seed", () => {
    // src/db/seeds/default.ts：S010、T001 的密码固定；管理员密码在开发鉴权开启时为 DEV_ADMIN_PASSWORD。
    expect(DEV_STUDENT_ID).toBe("S010");
    expect(DEV_STUDENT_PASSWORD).toBe("S010");
    expect(DEV_TEACHER_ID).toBe("T001");
    expect(DEV_TEACHER_PASSWORD).toBe("T001");
    expect(DEV_ADMIN_USERNAME).toBe("admin");
    expect(DEV_ADMIN_PASSWORD).toBe("admin123");
});
