import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Task Filters", () => {
    test("can filter tasks by class", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-task").click();
        await expect(page).toHaveURL(/\/teacher\/task$/);
        await expect(page.getByTestId("teacher-task-class-filter")).toBeVisible();

        // Wait for initial list
        await expect(page.locator('[data-testid^="teacher-task-row-"]')).not.toHaveCount(0);

        // Filter by class A
        await page.getByTestId("teacher-task-class-filter").click();
        await page.getByRole("option", { name: "E2E 教师班级A" }).click();

        await expect(page.locator('[data-testid^="teacher-task-row-"]')).not.toHaveCount(0);
        const rows = page.locator('[data-testid^="teacher-task-row-"]');
        const count = await rows.count();
        for (let i = 0; i < count; i++) {
            await expect(rows.nth(i)).toContainText("E2E 教师班级A");
        }
    });
});
