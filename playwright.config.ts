import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    workers: 1,
    reporter: process.env.CI ? "github" : "list",
    timeout: 120_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        headless: true,
    },
    projects: [
        {
            name: "admin",
            testMatch: "admin-smoke.spec.ts",
        },
        {
            name: "teacher",
            testMatch: "teacher-smoke.spec.ts",
        },
        {
            name: "student",
            testMatch: "student-smoke.spec.ts",
        },
        {
            name: "teacher-student",
            testMatch: "teacher-student-linkage.spec.ts",
        },
    ],
});
