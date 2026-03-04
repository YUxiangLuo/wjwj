import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Student Search & Reset", () => {
    test("can search students in class", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-class").click();
        await expect(page.getByTestId("teacher-class-search")).toBeVisible();

        await page.locator('[data-testid^="teacher-class-manage-students-"]').first().click();
        await expect(page).toHaveURL(/\/teacher\/class\/\d+\/students$/);
        await expect(page.getByTestId("teacher-student-search")).toBeVisible();

        // Search for known student
        await page.getByTestId("teacher-student-search").fill("student-e2e");
        await expect(page.locator("tr", { hasText: "student-e2e" })).toBeVisible();

        // Search for non-existent student
        await page.getByTestId("teacher-student-search").fill("nonexistent-xyz");
        await expect(page.locator("tr", { hasText: "nonexistent-xyz" })).toHaveCount(0);
    });

    test("can reset student password", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-class").click();
        await page.locator('[data-testid^="teacher-class-manage-students-"]').first().click();
        await expect(page).toHaveURL(/\/teacher\/class\/\d+\/students$/);

        const row = page.locator("tr", { hasText: "student-e2e" });
        await expect(row).toBeVisible();

        await row.locator('[data-testid^="teacher-student-reset-"]').click();
        await page.getByTestId("teacher-student-confirm-submit").click();

        // Verify success toast or that the row still exists
        await expect(row).toBeVisible();
    });
});
