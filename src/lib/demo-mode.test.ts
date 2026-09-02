import { expect, test } from "bun:test";
import {
    DEMO_ADMIN_PASSWORD,
    DEMO_ADMIN_USERNAME,
    DEMO_MODE,
    DEMO_STUDENT_ID,
    DEMO_STUDENT_PASSWORD,
    DEMO_TEACHER_ID,
    DEMO_TEACHER_PASSWORD,
    resolveDemoMode,
    shouldRequireAdminPasswordChange,
} from "./demo-mode";

test("demo mode is on only when DEMO_MODE=1", () => {
    expect(resolveDemoMode({ DEMO_MODE: "1" })).toBe(true);
    expect(resolveDemoMode({ DEMO_MODE: "1", NODE_ENV: "production" })).toBe(true);
});

test("demo mode is off otherwise", () => {
    expect(resolveDemoMode({})).toBe(false);
    expect(resolveDemoMode({ DEMO_MODE: "0" })).toBe(false);
    expect(resolveDemoMode({ DEMO_MODE: "true" })).toBe(false);
    expect(resolveDemoMode({ NODE_ENV: "production" })).toBe(false);
});

test("DEMO_MODE constant stays off in the test environment", () => {
    // bun test 不设置 DEMO_MODE；为真说明测试环境被污染。
    expect(DEMO_MODE).toBe(false);
});

test("demo mode skips only the administrator first-password gate", () => {
    expect(shouldRequireAdminPasswordChange(1, { devAuthMode: false, demoMode: false })).toBe(true);
    expect(shouldRequireAdminPasswordChange(1, { devAuthMode: false, demoMode: true })).toBe(false);
    expect(shouldRequireAdminPasswordChange(1, { devAuthMode: true, demoMode: false })).toBe(false);
    expect(shouldRequireAdminPasswordChange(0, { devAuthMode: false, demoMode: false })).toBe(false);
});

test("demo accounts match the default seed", () => {
    // S010 is the static fallback; demo refresh normally replaces it from the seeded class.
    expect(DEMO_STUDENT_ID).toBe("S010");
    expect(DEMO_STUDENT_PASSWORD).toBe("Student!010");
    expect(DEMO_TEACHER_ID).toBe("T001");
    expect(DEMO_TEACHER_PASSWORD).toBe("Teacher!2026");
    expect(DEMO_ADMIN_USERNAME).toBe("admin");
    expect(DEMO_ADMIN_PASSWORD).toBe("admin123");
});
