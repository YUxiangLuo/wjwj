import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin Dashboard", () => {
    test("displays KPI stat cards", async ({ page }) => {
        await loginAsAdmin(page);

        await expect(page.getByText("当前学期")).toBeVisible();
        await expect(page.getByText("教师总数")).toBeVisible();
        await expect(page.getByText("班级总数")).toBeVisible();
        await expect(page.getByText("学生总数")).toBeVisible();
        await expect(page.getByText("助教总数")).toBeVisible();
        await expect(page.getByText("今日活跃用户")).toBeVisible();
        await expect(page.getByText("今日登录次数")).toBeVisible();
        await expect(page.getByText("待处理事项")).toBeVisible();
    });

    test("displays role count overview", async ({ page }) => {
        await loginAsAdmin(page);

        await expect(page.getByText("角色数量概览")).toBeVisible();
        await expect(page.locator("text=学生").first()).toBeVisible();
        await expect(page.locator("text=教师").first()).toBeVisible();
        await expect(page.locator("text=助教").first()).toBeVisible();
    });

    test("displays system status section", async ({ page }) => {
        await loginAsAdmin(page);

        await expect(page.getByText("系统状态")).toBeVisible();
        await expect(page.getByText("CPU 使用率")).toBeVisible();
        await expect(page.getByText("内存使用率")).toBeVisible();
        await expect(page.getByText("磁盘使用率")).toBeVisible();
    });

    test("displays quick actions that navigate correctly", async ({ page }) => {
        await loginAsAdmin(page);

        await expect(page.getByText("快速操作")).toBeVisible();

        const publishBtn = page.getByRole("link", { name: "发布公告" });
        await expect(publishBtn).toBeVisible();

        const addTeacherBtn = page.getByRole("link", { name: "新增教师" });
        await expect(addTeacherBtn).toBeVisible();

        const createClassBtn = page.getByRole("link", { name: "创建班级" });
        await expect(createClassBtn).toBeVisible();

        const settingsBtn = page.getByRole("link", { name: "系统设置" });
        await expect(settingsBtn).toBeVisible();

        await addTeacherBtn.click();
        await expect(page).toHaveURL(/\/admin\/teacher$/);
    });

    test("displays recent activity section", async ({ page }) => {
        await loginAsAdmin(page);

        await expect(page.getByText("最近动态")).toBeVisible();
        const viewAllLink = page.getByRole("link", { name: "查看全部" });
        await expect(viewAllLink).toBeVisible();

        await viewAllLink.click();
        await expect(page).toHaveURL(/\/admin\/announcement$/);
    });
});
