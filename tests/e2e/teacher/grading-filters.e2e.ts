import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

test.describe("Teacher Grading Filters", () => {
    test("can filter by status and class", async ({ page }) => {
        await loginAsTeacher(page);

        await page.goto("/teacher/grading");
        await expect(page.getByTestId("teacher-grading-status-filter")).toBeVisible();

        // 等待初始列表加载完成（确保有数据）
        await expect(page.locator('[data-testid^="teacher-grading-card-"]')).not.toHaveCount(0);

        // 使用"已批改"状态测试（grading-detail 测试会增加已批改数量，不会减少）
        await page.getByTestId("teacher-grading-status-filter").click();
        await page.getByRole("option", { name: "已批改" }).click();

        // 等待筛选后的列表加载
        await expect(page.locator('[data-testid^="teacher-grading-card-"]')).not.toHaveCount(0);

        // 筛选班级A（班级A有 2 条已批改提交，更稳定）
        await page.getByTestId("teacher-grading-class-filter").click();
        await page.getByRole("option", { name: "E2E 教师班级A" }).click();

        // 等待列表更新并验证筛选结果
        const cards = page.locator('[data-testid^="teacher-grading-card-"]');
        await expect(cards.first()).toBeVisible();
        await expect(cards.first()).toContainText("E2E 教师班级A");
        // 已批改状态不应显示"开始批改"按钮
        await expect(page.getByRole("button", { name: "开始批改" })).toHaveCount(0);
    });
});
