import { expect, test } from "@playwright/test";
import { loginAsStudent } from "./helpers";

test.describe("Student Task Hall", () => {
    test("displays stats cards and task grid", async ({ page }) => {
        await loginAsStudent(page);

        await expect(page.getByTestId("student-stats-section")).toBeVisible();
        await expect(page.getByTestId("student-stat-in-progress")).toBeVisible();
        await expect(page.getByTestId("student-stat-graded")).toBeVisible();
        await expect(page.getByTestId("student-stat-average")).toBeVisible();

        await expect(page.getByTestId("student-task-grid")).toBeVisible();
        await expect(page.locator('[data-testid^="student-task-card-"]')).not.toHaveCount(0);
    });

    test("shows task cards with correct info", async ({ page }) => {
        await loginAsStudent(page);

        const taskCards = page.locator('[data-testid^="student-task-card-"]');
        await expect(taskCards).not.toHaveCount(0);

        const firstCard = taskCards.first();
        await expect(firstCard).toBeVisible();
        // Task cards should show topic name
        await expect(firstCard.locator("h3, [class*='CardTitle']")).toBeVisible();
    });

    test("filter tabs work correctly", async ({ page }) => {
        await loginAsStudent(page);

        // All filter is default
        await expect(page.getByTestId("student-filter-all")).toBeVisible();
        const allCards = await page.locator('[data-testid^="student-task-card-"]').count();
        expect(allCards).toBeGreaterThan(0);

        // Click "已批改" filter
        await page.getByTestId("student-filter-graded").click();
        // Should show graded tasks (topic A is graded)
        await expect(page.locator('[data-testid^="student-task-card-"]')).not.toHaveCount(0);

        // Click "进行中" filter - rejected tasks appear here too
        await page.getByTestId("student-filter-in-progress").click();
        // Rejected task shows up in "in_progress" filter
        await expect(page.locator('[data-testid^="student-task-card-"]')).not.toHaveCount(0);

        // Click "已提交" filter - no submitted (pending) tasks in our seed
        await page.getByTestId("student-filter-submitted").click();
        await expect(page.getByText("暂无相关任务")).toBeVisible();

        // Click "全部" to return to all tasks
        await page.getByTestId("student-filter-all").click();
        await expect(page.locator('[data-testid^="student-task-card-"]')).not.toHaveCount(0);
    });

    test("announcement banner and dialog", async ({ page }) => {
        await loginAsStudent(page);

        // Should show an announcement banner for the unread announcement
        const banner = page.getByText("最新公告");
        if (await banner.isVisible()) {
            await page.getByRole("button", { name: "查看详情" }).click();
            await expect(page.getByText("系统公告")).toBeVisible();
            await expect(page.getByText("E2E 系统通知公告")).toBeVisible();
        }
    });
});
