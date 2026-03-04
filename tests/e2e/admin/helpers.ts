import { expect, type Page } from "@playwright/test";

export async function loginAsAdmin(page: Page) {
    await page.goto("/admin/login");
    await page.getByTestId("admin-login-username").fill("admin");
    await page.getByTestId("admin-login-password").fill("123456");
    await page.getByTestId("admin-login-submit").click();
    await expect(page).toHaveURL(/\/admin\/?$/);
    await expect(page.getByRole("heading", { name: "首页概览" })).toBeVisible();
}
