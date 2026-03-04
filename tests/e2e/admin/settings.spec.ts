import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin System Settings", () => {
    test("update and persist general/security settings", async ({ page }) => {
        const unique = String(Date.now()).slice(-6);
        const systemName = `系统${unique}`;

        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-settings").click();
        await expect(page).toHaveURL(/\/admin\/settings$/);

        await page.getByTestId("settings-system-name").fill(systemName);
        await page.getByTestId("settings-save").click();
        await expect(page.getByText("设置已保存").first()).toBeVisible();

        await page.getByTestId("settings-section-security").click();
        await page.getByTestId("settings-max-login-attempts").fill("7");
        await page.getByTestId("settings-lock-duration").fill("25");
        await page.getByTestId("settings-save").click();
        await expect(page.getByText("设置已保存").first()).toBeVisible();

        await page.reload();
        await expect(page.getByTestId("settings-system-name")).toHaveValue(systemName);

        await page.getByTestId("settings-section-security").click();
        await expect(page.getByTestId("settings-max-login-attempts")).toHaveValue("7");
        await expect(page.getByTestId("settings-lock-duration")).toHaveValue("25");
    });
});
