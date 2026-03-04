import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests/e2e",
    testMatch: /.*\.e2e\.ts$/,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
    timeout: 45_000,
    expect: {
        timeout: 8_000,
    },
    use: {
        baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    globalSetup: "./tests/e2e/global-setup.ts",
    webServer: {
        command: "DISABLE_AUTO_BACKUP=1 bun src/index.ts",
        url: `${process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000"}/admin/login`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
