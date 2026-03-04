import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Class & Student", () => {
    test("can add, disable, and delete a student", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-class").click();
        await expect(page.getByTestId("teacher-class-search")).toBeVisible();

        await page.locator('[data-testid^="teacher-class-manage-students-"]').first().click();
        await expect(page).toHaveURL(/\/teacher\/class\/\d+\/students$/);
        await expect(page.getByTestId("teacher-student-search")).toBeVisible();

        const studentId = `e2e${Date.now().toString().slice(-8)}`;
        const studentName = `E2E学生${Date.now().toString().slice(-4)}`;

        await page.getByTestId("teacher-student-add-open").click();
        await page.getByTestId("teacher-student-add-id").fill(studentId);
        await page.getByTestId("teacher-student-add-name").fill(studentName);
        await page.getByTestId("teacher-student-add-email").fill(`${studentId}@example.com`);
        await page.getByTestId("teacher-student-add-submit").click();

        const row = page.locator("tr", { hasText: studentId });
        await expect(row).toBeVisible();
        await expect(row.getByText("正常")).toBeVisible();

        await row.locator('[data-testid^="teacher-student-toggle-"]').click();
        await page.getByTestId("teacher-student-confirm-submit").click();
        await expect(row.getByText("已禁用")).toBeVisible();

        await row.locator('[data-testid^="teacher-student-delete-"]').click();
        await page.getByTestId("teacher-student-confirm-submit").click();
        await expect(page.locator("tr", { hasText: studentId })).toHaveCount(0);
    });
});
