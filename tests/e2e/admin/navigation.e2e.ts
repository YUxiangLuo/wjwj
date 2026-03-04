import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin Navigation", () => {
    test("can switch to semester and teacher pages", async ({ page }) => {
        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-semester").click();
        await expect(page).toHaveURL(/\/admin\/semester$/);
        await expect(page.locator("header").getByRole("heading", { name: "学期管理" })).toBeVisible();

        await page.getByTestId("admin-nav-teacher").click();
        await expect(page).toHaveURL(/\/admin\/teacher$/);
        await expect(page.locator("header").getByRole("heading", { name: "教师管理" })).toBeVisible();
    });

    test("can navigate to assistant management", async ({ page }) => {
        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-assistant").click();
        await expect(page).toHaveURL(/\/admin\/assistant$/);
        await expect(page.locator("header").getByRole("heading", { name: "助教管理" })).toBeVisible();
    });

    test("can navigate to class management", async ({ page }) => {
        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-class").click();
        await expect(page).toHaveURL(/\/admin\/class$/);
        await expect(page.locator("header").getByRole("heading", { name: "班级管理" })).toBeVisible();
    });

    test("can navigate to student management", async ({ page }) => {
        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-student").click();
        await expect(page).toHaveURL(/\/admin\/student$/);
        await expect(page.locator("header").getByRole("heading", { name: "学生管理" })).toBeVisible();
    });

    test("can navigate to system monitor", async ({ page }) => {
        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-monitor").click();
        await expect(page).toHaveURL(/\/admin\/monitor$/);
        await expect(page.locator("header").getByRole("heading", { name: "系统监控" })).toBeVisible();
    });

    test("can navigate to announcement management", async ({ page }) => {
        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-announcement").click();
        await expect(page).toHaveURL(/\/admin\/announcement$/);
        await expect(page.locator("header").getByRole("heading", { name: "公告管理" })).toBeVisible();
    });

    test("can navigate to system settings", async ({ page }) => {
        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-settings").click();
        await expect(page).toHaveURL(/\/admin\/settings$/);
        await expect(page.locator("header").getByRole("heading", { name: "系统设置" })).toBeVisible();
    });

    test("can return to dashboard", async ({ page }) => {
        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-settings").click();
        await expect(page).toHaveURL(/\/admin\/settings$/);

        await page.getByTestId("admin-nav-dashboard").click();
        await expect(page).toHaveURL(/\/admin\/?$/);
        await expect(page.getByRole("heading", { name: "首页概览" })).toBeVisible();
    });
});
