import { expect, test } from "@playwright/test";
import { loginAsStudent } from "./helpers";

test.describe("Student Auth", () => {
    test("login success and reach task hall", async ({ page }) => {
        await loginAsStudent(page);
        await expect(page.getByText("欢迎回来")).toBeVisible();
        await expect(page.getByText("我的任务")).toBeVisible();
    });

    test("shows error for invalid credentials", async ({ page }) => {
        await page.goto("/student/login");
        await page.getByTestId("student-login-username").fill("student");
        await page.getByTestId("student-login-password").fill("wrong-password");
        await page.getByTestId("student-login-submit").click();

        await expect(page.getByText(/学号或密码错误|登录失败/)).toBeVisible();
        await expect(page).toHaveURL(/\/student\/login$/);
    });

    test("disabled student cannot login", async ({ page }) => {
        await page.goto("/student/login");
        await page.getByTestId("student-login-username").fill("student-disabled");
        await page.getByTestId("student-login-password").fill("123456");
        await page.getByTestId("student-login-submit").click();

        await expect(page.getByText(/账号已被停用|登录失败/)).toBeVisible();
        await expect(page).toHaveURL(/\/student\/login$/);
    });

    test("empty fields show validation error", async ({ page }) => {
        await page.goto("/student/login");
        await page.getByTestId("student-login-submit").click();

        await expect(page.getByText(/请输入学号和密码|请输入/)).toBeVisible();
    });

    test("logout returns to login page", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-logout-trigger").click();
        await expect(page.getByText("确认退出登录？")).toBeVisible();
        await page.getByRole("button", { name: "退出登录" }).click();

        await expect(page).toHaveURL(/\/student\/login$/);
        await expect(page.getByTestId("student-login-submit")).toBeVisible();
    });
});
