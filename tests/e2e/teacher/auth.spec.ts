import { expect, test } from "@playwright/test";
import { loginAsAssistant, loginAsTeacher } from "./helpers";

test.describe("Teacher Auth", () => {
    test("teacher login success and reach dashboard", async ({ page }) => {
        await loginAsTeacher(page);
        await expect(page.getByText("教师菜单")).toBeVisible();
        await expect(page.getByText("教学概览")).toBeVisible();
    });

    test("assistant login redirects to grading with limited menu", async ({ page }) => {
        await loginAsAssistant(page);
        await expect(page.getByText("助教菜单")).toBeVisible();
        await expect(page.getByRole("link", { name: "作业批改" })).toBeVisible();
        await expect(page.getByRole("link", { name: "班级管理" })).toHaveCount(0);
    });

    test("shows error for invalid credentials", async ({ page }) => {
        await page.goto("/teacher/login");
        await page.getByTestId("teacher-login-username").fill("teacher");
        await page.getByTestId("teacher-login-password").fill("wrong-password");
        await page.getByTestId("teacher-login-submit").click();

        await expect(page.getByText(/工号或密码错误/)).toBeVisible();
        await expect(page).toHaveURL(/\/teacher\/login$/);
    });

    test("logout returns to login page", async ({ page }) => {
        await loginAsTeacher(page);
        await page.getByTitle("退出登录").click();

        await expect(page).toHaveURL(/\/teacher\/login$/);
        await expect(page.getByTestId("teacher-login-submit")).toBeVisible();
    });
});
