import { expect, test } from "@playwright/test";
import { loginAsStudent } from "./helpers";

test.describe("Student Navigation", () => {
    test("can navigate to profile and back", async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to profile
        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-nav-profile").click();
        await expect(page).toHaveURL(/\/student\/profile$/);
        await expect(page.getByText("个人信息")).toBeVisible();

        // Navigate back to home
        await page.getByRole("button", { name: "返回首页" }).click();
        await expect(page).toHaveURL(/\/student\/?$/);
        await expect(page.getByText("我的任务")).toBeVisible();
    });

    test("header logo returns to task hall", async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to profile first
        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-nav-profile").click();
        await expect(page).toHaveURL(/\/student\/profile$/);

        // Click logo to return
        await page.getByText("统计学虚拟仿真实验室").click();
        await expect(page).toHaveURL(/\/student\/?$/);
    });

    test("can navigate from task hall to task detail and back", async ({ page }) => {
        await loginAsStudent(page);

        // Click on task card
        const firstCard = page.locator('[data-testid^="student-task-card-"]').first();
        await expect(firstCard).toBeVisible();
        await firstCard.locator("a").first().click();

        await expect(page).toHaveURL(/\/student\/task\/\d+$/);
        await expect(page.getByTestId("student-task-detail")).toBeVisible();

        // Click back arrow in header
        await page.locator("header").getByRole("link").first().click();
        await expect(page).toHaveURL(/\/student\/?$/);
    });

    test("unauthenticated access redirects to login", async ({ page }) => {
        await page.goto("/student/");
        await expect(page).toHaveURL(/\/student\/login$/);
    });

    test("unknown routes redirect to task hall after login", async ({ page }) => {
        await loginAsStudent(page);
        await page.goto("/student/nonexistent-page");
        await expect(page).toHaveURL(/\/student\/?$/);
    });
});
