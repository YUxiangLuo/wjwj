import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type DashboardData = {
    stats: Array<{ label: string; value: number }>;
    recentSubmissions: Array<{ student: string; class: string; topic: string; time: string }>;
    recentGradings: Array<{ student: string; class: string; topic: string; score: number | null; rejected: boolean; time: string }>;
};

test.describe("Teacher Dashboard", () => {
    test("displays stats cards with correct labels", async ({ page }) => {
        await loginAsTeacher(page);

        await expect(page.getByRole("heading", { name: "首页概览" })).toBeVisible();

        await expect(page.getByText("我的班级")).toBeVisible();
        await expect(page.getByText("我的课题")).toBeVisible();
        await expect(page.getByText("待批改作业")).toBeVisible();
        await expect(page.getByText("进行中任务")).toBeVisible();
    });

    test("shows recent submissions section", async ({ page }) => {
        await loginAsTeacher(page);

        await expect(page.getByText("最近提交")).toBeVisible();
    });

    test("shows recent gradings section", async ({ page }) => {
        await loginAsTeacher(page);

        await expect(page.getByText("最近批改")).toBeVisible();
    });

    test("quick action buttons navigate correctly", async ({ page }) => {
        await loginAsTeacher(page);

        const gradingLink = page.getByRole("link", { name: "进入批改" });
        await expect(gradingLink).toBeVisible();
        await gradingLink.click();
        await expect(page).toHaveURL(/\/teacher\/grading$/);

        await page.goto("/teacher");
        await expect(page.getByRole("heading", { name: "首页概览" })).toBeVisible();

        const topicLink = page.getByRole("link", { name: "创建新课题" });
        await expect(topicLink).toBeVisible();
        await topicLink.click();
        await expect(page).toHaveURL(/\/teacher\/topic$/);

        await page.goto("/teacher");
        await expect(page.getByRole("heading", { name: "首页概览" })).toBeVisible();

        const exportLink = page.getByRole("link", { name: "导出成绩" });
        await expect(exportLink).toBeVisible();
        await exportLink.click();
        await expect(page).toHaveURL(/\/teacher\/export$/);
    });

    test("dashboard stats API returns valid data", async ({ page }) => {
        await loginAsTeacher(page);

        const res = await page.request.get("/api/teacher/dashboard");
        const json = (await res.json()) as ApiResponse<DashboardData>;
        expect(json.success).toBe(true);
        expect(json.data!.stats).toHaveLength(4);
        expect(json.data!.stats[0].label).toBe("我的班级");
        expect(json.data!.stats[0].value).toBeGreaterThanOrEqual(0);
        expect(json.data!.recentSubmissions).toBeDefined();
        expect(json.data!.recentGradings).toBeDefined();
    });
});
