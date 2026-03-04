import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Assistant Management", () => {
    test("can add assistant, assign class, and toggle status", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-assistant").click();
        await expect(page).toHaveURL(/\/teacher\/assistant$/);
        await expect(page.getByTestId("teacher-assistant-search")).toBeVisible();

        const suffix = Date.now().toString().slice(-6);
        const account = `ast${suffix}`;
        const name = `E2E助教${suffix}`;

        await page.getByTestId("teacher-assistant-add-open").click();
        await page.getByTestId("teacher-assistant-add-account").fill(account);
        await page.getByTestId("teacher-assistant-add-name").fill(name);
        await page.getByTestId("teacher-assistant-add-submit").click();

        const row = page.locator('[data-testid^="teacher-assistant-row-"]', { hasText: account }).first();
        await expect(row).toBeVisible();

        await row.locator('[data-testid^="teacher-assistant-assign-open-"]').click();
        const classLabel = page.locator('label:has([data-testid^="teacher-assistant-assign-check-"])').first();
        const className = (await classLabel.locator(".font-medium").first().textContent())?.trim() ?? "";
        await classLabel.locator('[data-testid^="teacher-assistant-assign-check-"]').check();
        await page.getByTestId("teacher-assistant-assign-submit").click();

        await expect(row).toContainText(className);

        await row.locator('[data-testid^="teacher-assistant-toggle-"]').click();
        await expect(row.getByText("已停用")).toBeVisible();
    });
});
