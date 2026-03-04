import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Topic Filters", () => {
    test("can filter topics by status", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-topic").click();
        await expect(page).toHaveURL(/\/teacher\/topic$/);
        await expect(page.getByTestId("teacher-topic-status-filter")).toBeVisible();

        // Wait for initial list to load
        await expect(page.locator('[data-testid^="teacher-topic-row-"]')).not.toHaveCount(0);

        // Filter by published status
        await page.getByTestId("teacher-topic-status-filter").click();
        await page.getByRole("option", { name: "已发布" }).click();

        await expect(page.locator('[data-testid^="teacher-topic-row-"]')).not.toHaveCount(0);
        const publishedRows = page.locator('[data-testid^="teacher-topic-row-"]');
        const count = await publishedRows.count();
        for (let i = 0; i < count; i++) {
            await expect(publishedRows.nth(i).getByText("已发布")).toBeVisible();
        }
    });

    test("can search topics by name", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-topic").click();
        await expect(page.getByTestId("teacher-topic-search")).toBeVisible();

        await page.getByTestId("teacher-topic-search").fill("E2E 抽样课题");
        await expect(page.locator('[data-testid^="teacher-topic-row-"]')).not.toHaveCount(0);
        await expect(page.locator('[data-testid^="teacher-topic-row-"]').first()).toContainText("E2E 抽样课题");

        await page.getByTestId("teacher-topic-search").fill("不存在的课题名称XYZ");
        await expect(page.getByText("共 0 条数据")).toBeVisible();
    });
});
