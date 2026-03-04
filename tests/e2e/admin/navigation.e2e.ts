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
});
