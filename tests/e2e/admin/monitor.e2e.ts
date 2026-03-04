import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin System Monitor", () => {
    test("displays metric cards", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-monitor").click();
        await expect(page).toHaveURL(/\/admin\/monitor$/);

        await expect(page.getByText("系统监控")).toBeVisible();
        await expect(page.getByText("CPU 使用率")).toBeVisible();
        await expect(page.getByText("内存使用率")).toBeVisible();
        await expect(page.getByText("磁盘使用率")).toBeVisible();
        await expect(page.getByText("网络带宽")).toBeVisible();
    });

    test("displays active users count", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-monitor").click();

        await expect(page.getByText("活跃在线用户")).toBeVisible();
    });

    test("can pause and resume live monitoring", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-monitor").click();

        await expect(page.getByText("实时监控中")).toBeVisible();

        await page.getByRole("button", { name: "暂停" }).click();
        await expect(page.getByText("监控已暂停")).toBeVisible();

        await page.getByRole("button", { name: "恢复" }).click();
        await expect(page.getByText("实时监控中")).toBeVisible();
    });

    test("displays system logs section", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-monitor").click();

        await expect(page.getByText("系统日志")).toBeVisible();
    });

    test("has export report and refresh buttons", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-monitor").click();

        await expect(page.getByRole("button", { name: "导出报告" })).toBeVisible();
        await expect(page.getByRole("button", { name: "刷新" })).toBeVisible();
    });
});
