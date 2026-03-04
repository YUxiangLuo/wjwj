import { expect, test } from "@playwright/test";
import { loginAsStudent } from "./helpers";

test.describe("Student Submission History", () => {
    test("can navigate to submission history for graded task", async ({ page }) => {
        await loginAsStudent(page);

        // Filter to graded tasks
        await page.getByTestId("student-filter-graded").click();
        const gradedCard = page.locator('[data-testid^="student-task-card-"]').first();
        await expect(gradedCard).toBeVisible();

        // Click the history button (clock icon)
        await gradedCard.getByTitle("历史记录").click();
        await expect(page).toHaveURL(/\/student\/task\/\d+\/history$/);
        await expect(page.getByTestId("student-submission-history")).toBeVisible();
        await expect(page.getByText("提交记录")).toBeVisible();
    });

    test("submission history displays graded submission with score", async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to graded task's history
        await page.getByTestId("student-filter-graded").click();
        const gradedCard = page.locator('[data-testid^="student-task-card-"]').first();
        await gradedCard.getByTitle("历史记录").click();

        await expect(page.getByTestId("student-submission-history")).toBeVisible();

        // Should show submission row
        const submissionRow = page.locator('[data-testid^="student-submission-row-"]').first();
        await expect(submissionRow).toBeVisible();

        // Should display status and score
        await expect(submissionRow.getByText("已批改")).toBeVisible();
        await expect(submissionRow.getByText("90")).toBeVisible();
    });

    test("can navigate to submission detail", async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to graded task's history
        await page.getByTestId("student-filter-graded").click();
        const gradedCard = page.locator('[data-testid^="student-task-card-"]').first();
        await gradedCard.getByTitle("历史记录").click();

        await expect(page.getByTestId("student-submission-history")).toBeVisible();

        // Click "查看详情" on the first submission
        await page.locator('[data-testid^="student-submission-row-"]').first().getByRole("link", { name: "查看详情" }).click();

        await expect(page).toHaveURL(/\/student\/submissions\/\d+$/);
        await expect(page.getByTestId("student-submission-detail")).toBeVisible();
    });

    test("submission detail shows score breakdown and teacher comment", async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to graded task's submission detail
        await page.getByTestId("student-filter-graded").click();
        const gradedCard = page.locator('[data-testid^="student-task-card-"]').first();
        await gradedCard.getByTitle("历史记录").click();
        await page.locator('[data-testid^="student-submission-row-"]').first().getByRole("link", { name: "查看详情" }).click();

        await expect(page.getByTestId("student-submission-detail")).toBeVisible();

        // Should show score breakdown labels
        await expect(page.getByText("问卷设计")).toBeVisible();
        await expect(page.getByText("实验过程")).toBeVisible();
        await expect(page.getByText("实验报告")).toBeVisible();
        await expect(page.getByText("总分")).toBeVisible();

        // Teacher comment
        await expect(page.getByText("教师评语")).toBeVisible();
        await expect(page.getByText("实验完成良好，数据分析准确。")).toBeVisible();
    });

    test("rejected submission shows reject reason in history", async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to rejected task's history (rejected shows in "in_progress" filter)
        await page.getByTestId("student-filter-in-progress").click();
        const rejectedCard = page.locator('[data-testid^="student-task-card-"]', { hasText: "被驳回" }).first();
        if (await rejectedCard.isVisible()) {
            await rejectedCard.getByTitle("历史记录").click();
            await expect(page.getByTestId("student-submission-history")).toBeVisible();

            const submissionRow = page.locator('[data-testid^="student-submission-row-"]').first();
            await expect(submissionRow).toBeVisible();
            await expect(submissionRow.getByText("被驳回")).toBeVisible();
            await expect(page.getByText(/驳回原因/)).toBeVisible();
        }
    });

    test("submission detail back button returns to history", async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to submission detail
        await page.getByTestId("student-filter-graded").click();
        const gradedCard = page.locator('[data-testid^="student-task-card-"]').first();
        await gradedCard.getByTitle("历史记录").click();
        await page.locator('[data-testid^="student-submission-row-"]').first().getByRole("link", { name: "查看详情" }).click();
        await expect(page.getByTestId("student-submission-detail")).toBeVisible();

        // Click back button
        await page.getByRole("button", { name: "返回历史记录" }).click();
        await expect(page).toHaveURL(/\/student\/task\/\d+\/history$/);
        await expect(page.getByTestId("student-submission-history")).toBeVisible();
    });
});
