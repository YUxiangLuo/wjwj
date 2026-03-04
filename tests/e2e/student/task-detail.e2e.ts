import { expect, test } from "@playwright/test";
import { loginAsStudent } from "./helpers";

test.describe("Student Task Detail", () => {
    test("can navigate to task detail page", async ({ page }) => {
        await loginAsStudent(page);

        // Click on the first task card link
        const firstCard = page.locator('[data-testid^="student-task-card-"]').first();
        await expect(firstCard).toBeVisible();

        // Get the task card link and click it
        await firstCard.locator("a").first().click();

        await expect(page.getByTestId("student-task-detail")).toBeVisible();
        await expect(page).toHaveURL(/\/student\/task\/\d+$/);
    });

    test("task detail shows topic name, description, and status", async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to first task
        await page.locator('[data-testid^="student-task-card-"]').first().locator("a").first().click();
        await expect(page.getByTestId("student-task-detail")).toBeVisible();

        // Topic name should be visible
        await expect(page.locator("h1")).toBeVisible();
        // Description section should exist
        await expect(page.getByText("课题介绍")).toBeVisible();
        // Status section should exist
        await expect(page.getByText("任务状态")).toBeVisible();
    });

    test("task detail shows experiment progress stages", async ({ page }) => {
        await loginAsStudent(page);

        await page.locator('[data-testid^="student-task-card-"]').first().locator("a").first().click();
        await expect(page.getByTestId("student-task-detail")).toBeVisible();

        // Progress section shows experiment stages
        await expect(page.getByText("实验进度概览")).toBeVisible();
        await expect(page.getByText("问卷设计")).toBeVisible();
        await expect(page.getByText("样本量规划")).toBeVisible();
        await expect(page.getByText("抽样执行")).toBeVisible();
        await expect(page.getByText("分析与报告")).toBeVisible();
    });

    test("back button returns to task hall", async ({ page }) => {
        await loginAsStudent(page);

        await page.locator('[data-testid^="student-task-card-"]').first().locator("a").first().click();
        await expect(page.getByTestId("student-task-detail")).toBeVisible();

        // Click back button
        await page.getByRole("button", { name: "返回任务列表" }).click();
        await expect(page).toHaveURL(/\/student\/?$/);
    });

    test("graded task shows score", async ({ page }) => {
        await loginAsStudent(page);

        // Filter to graded tasks
        await page.getByTestId("student-filter-graded").click();
        const gradedCard = page.locator('[data-testid^="student-task-card-"]').first();
        await expect(gradedCard).toBeVisible();

        // Navigate to the graded task detail
        await gradedCard.locator("a").first().click();
        await expect(page.getByTestId("student-task-detail")).toBeVisible();

        // Graded task should show score
        await expect(page.getByText("实验成绩")).toBeVisible();
        await expect(page.getByText("90")).toBeVisible();
    });
});
