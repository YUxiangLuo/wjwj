import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Export Filters", () => {
    test("can filter exports by class", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-export").click();
        await expect(page).toHaveURL(/\/teacher\/export$/);
        await expect(page.getByTestId("teacher-export-class-filter")).toBeVisible();

        // Wait for initial list
        await expect(page.locator('[data-testid^="teacher-export-row-"]')).not.toHaveCount(0);

        // Filter by class A
        await page.getByTestId("teacher-export-class-filter").click();
        await page.getByRole("option", { name: "E2E 教师班级A" }).click();

        const rows = page.locator('[data-testid^="teacher-export-row-"]');
        await expect(rows.first()).toBeVisible();
        const count = await rows.count();
        for (let i = 0; i < count; i++) {
            await expect(rows.nth(i)).toContainText("E2E 教师班级A");
        }
    });

    test("can filter exports by topic", async ({ page }) => {
        await loginAsTeacher(page);

        await page.goto("/teacher/export");
        await expect(page.getByTestId("teacher-export-topic-filter")).toBeVisible();

        // Wait for initial list
        await expect(page.locator('[data-testid^="teacher-export-row-"]')).not.toHaveCount(0);

        // Filter by topic
        await page.getByTestId("teacher-export-topic-filter").click();
        await page.getByRole("option", { name: "E2E 抽样课题" }).click();

        const rows = page.locator('[data-testid^="teacher-export-row-"]');
        await expect(rows.first()).toBeVisible();
        const count = await rows.count();
        for (let i = 0; i < count; i++) {
            await expect(rows.nth(i)).toContainText("E2E 抽样课题");
        }
    });

    test("individual task checkbox selection works", async ({ page }) => {
        await loginAsTeacher(page);

        await page.goto("/teacher/export");
        await expect(page.locator('[data-testid^="teacher-export-row-"]')).not.toHaveCount(0);

        // Initially batch export should be disabled
        await expect(page.getByTestId("teacher-export-batch")).toBeDisabled();

        // Check first individual checkbox
        const firstCheck = page.locator('[data-testid^="teacher-export-check-"]').first();
        await firstCheck.check();
        await expect(page.getByTestId("teacher-export-batch")).toBeEnabled();

        // Uncheck
        await firstCheck.uncheck();
        await expect(page.getByTestId("teacher-export-batch")).toBeDisabled();
    });
});
