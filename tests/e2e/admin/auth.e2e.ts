import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin Auth", () => {
    test("login success and reach dashboard", async ({ page }) => {
        await loginAsAdmin(page);
        await expect(page.getByText("Administrator")).toBeVisible();
    });

    test("shows error for invalid credentials", async ({ page }) => {
        await page.goto("/admin/login");
        await page.getByTestId("admin-login-username").fill("admin");
        await page.getByTestId("admin-login-password").fill("wrong-password");
        await page.getByTestId("admin-login-submit").click();

        await expect(page.getByText(/用户名或密码错误/)).toBeVisible();
        await expect(page).toHaveURL(/\/admin\/login$/);
    });

    test("logout returns to login page", async ({ page }) => {
        await loginAsAdmin(page);

        await page.getByTestId("admin-logout-trigger").click();
        await expect(page.getByText("确认退出登录?")).toBeVisible();
        await page.getByRole("button", { name: "退出" }).click();

        await expect(page).toHaveURL(/\/admin\/login$/);
        await expect(page.getByTestId("admin-login-submit")).toBeVisible();
    });
});
