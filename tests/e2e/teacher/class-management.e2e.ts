import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Class Management", () => {
    test("displays class list with search and semester filter", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-class").click();
        await expect(page).toHaveURL(/\/teacher\/class$/);
        await expect(page.getByTestId("teacher-class-search")).toBeVisible();
        await expect(page.getByTestId("teacher-class-semester-filter")).toBeVisible();

        // Class rows should be visible
        await expect(page.locator('[data-testid^="teacher-class-row-"]')).not.toHaveCount(0);
    });

    test("can search classes by name", async ({ page }) => {
        await loginAsTeacher(page);

        await page.goto("/teacher/class");
        await expect(page.getByTestId("teacher-class-search")).toBeVisible();

        await page.getByTestId("teacher-class-search").fill("E2E 教师班级A");
        await expect(page.locator('[data-testid^="teacher-class-row-"]', { hasText: "E2E 教师班级A" })).not.toHaveCount(0);

        await page.getByTestId("teacher-class-search").fill("不存在的班级XYZ");
        await expect(page.getByText("暂无符合条件的数据")).toBeVisible();
    });

    test("can navigate to student list from class row", async ({ page }) => {
        await loginAsTeacher(page);

        await page.goto("/teacher/class");
        await expect(page.locator('[data-testid^="teacher-class-manage-students-"]')).not.toHaveCount(0);

        await page.locator('[data-testid^="teacher-class-manage-students-"]').first().click();
        await expect(page).toHaveURL(/\/teacher\/class\/\d+\/students$/);
        await expect(page.getByTestId("teacher-student-search")).toBeVisible();
    });
});
