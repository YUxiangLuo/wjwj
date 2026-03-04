import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

function futureLocalDatetime(days: number) {
    const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

test.describe("Teacher Task Management", () => {
    test("can filter task list and extend deadline", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-task").click();
        await expect(page).toHaveURL(/\/teacher\/task$/);
        await expect(page.getByTestId("teacher-task-search")).toBeVisible();

        await expect(page.locator('[data-testid^="teacher-task-row-"]')).not.toHaveCount(0);

        await page.getByTestId("teacher-task-search").fill("不存在的课题");
        await expect(page.getByText("暂无符合条件的数据")).toBeVisible();

        await page.getByTestId("teacher-task-search").fill("E2E 抽样课题");
        await expect(page.locator('[data-testid^="teacher-task-row-"]')).not.toHaveCount(0);

        await page.locator('[data-testid^="teacher-task-extend-open-"]').first().click();
        await expect(page.getByRole("heading", { name: "延长截止时间" })).toBeVisible();

        await page.getByTestId("teacher-task-extend-deadline").fill(futureLocalDatetime(14));
        await page.getByTestId("teacher-task-extend-submit").click();

        await expect(page.getByRole("heading", { name: "延长截止时间" })).toHaveCount(0);
        await expect(page.locator('[data-testid^="teacher-task-row-"]')).not.toHaveCount(0);
    });
});
