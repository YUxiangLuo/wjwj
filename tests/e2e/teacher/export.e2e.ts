import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Grade Export", () => {
    test("can export single task grade file", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-export").click();
        await expect(page).toHaveURL(/\/teacher\/export$/);
        await expect(page.getByTestId("teacher-export-class-filter")).toBeVisible();

        const row = page.locator('[data-testid^="teacher-export-row-"]').first();
        await expect(row).toBeVisible();

        const downloadPromise = page.waitForEvent("download");
        await row.locator('[data-testid^="teacher-export-single-"]').click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/grade-export-.*\.xlsx/);
    });

    test("can batch export after selecting all", async ({ page }) => {
        await loginAsTeacher(page);

        await page.goto("/teacher/export");
        await expect(page.getByTestId("teacher-export-check-all")).toBeVisible();

        await page.getByTestId("teacher-export-check-all").check();
        await expect(page.getByTestId("teacher-export-batch")).toBeEnabled();

        const downloadPromise = page.waitForEvent("download");
        await page.getByTestId("teacher-export-batch").click();
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/grade-export-.*\.xlsx/);
    });
});
