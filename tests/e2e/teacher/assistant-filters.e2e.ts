import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Assistant Filters", () => {
    test("can filter assistants by status", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-assistant").click();
        await expect(page).toHaveURL(/\/teacher\/assistant$/);
        await expect(page.getByTestId("teacher-assistant-status-filter")).toBeVisible();

        // Wait for initial list
        await expect(page.locator('[data-testid^="teacher-assistant-row-"]')).not.toHaveCount(0);

        // Filter by disabled status
        await page.getByTestId("teacher-assistant-status-filter").click();
        await page.getByRole("option", { name: "已停用" }).click();

        // Should still have results (assistant2 is disabled)
        const rows = page.locator('[data-testid^="teacher-assistant-row-"]');
        const count = await rows.count();
        for (let i = 0; i < count; i++) {
            await expect(rows.nth(i).getByText("已停用")).toBeVisible();
        }
    });

    test("can search assistants by name or account", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-assistant").click();
        await expect(page.getByTestId("teacher-assistant-search")).toBeVisible();

        await page.getByTestId("teacher-assistant-search").fill("assistant");
        await expect(page.locator('[data-testid^="teacher-assistant-row-"]', { hasText: "assistant" })).not.toHaveCount(0);

        await page.getByTestId("teacher-assistant-search").fill("不存在的助教ZZZ");
        await expect(page.getByText("暂无符合条件的助教")).toBeVisible();
    });
});
