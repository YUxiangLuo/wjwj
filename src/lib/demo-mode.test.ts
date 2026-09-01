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

test("demo accounts match the default seed", () => {
    // src/db/seeds/default.ts：S010、T001 非首次登录，管理员密码来自 SEED_ADMIN_PASSWORD。
    expect(DEMO_STUDENT_ID).toBe("S010");
    expect(DEMO_STUDENT_PASSWORD).toBe("Student!010");
    expect(DEMO_TEACHER_ID).toBe("T001");
    expect(DEMO_TEACHER_PASSWORD).toBe("Teacher!2026");
    expect(DEMO_ADMIN_USERNAME).toBe("admin");
    expect(DEMO_ADMIN_PASSWORD).toBe("admin123");
});
