import { expect, type Page } from "@playwright/test";

export async function loginAsTeacher(page: Page) {
    await page.goto("/teacher/login");
    await page.getByTestId("teacher-login-username").fill("teacher");
    await page.getByTestId("teacher-login-password").fill("123456");
    await page.getByTestId("teacher-login-submit").click();
    await expect(page).toHaveURL(/\/teacher\/?$/);
    await expect(page.getByRole("heading", { name: "首页概览" })).toBeVisible();
}

export async function loginAsAssistant(page: Page) {
    await page.goto("/teacher/login");
    await page.getByTestId("teacher-login-username").fill("assistant");
    await page.getByTestId("teacher-login-password").fill("123456");
    await page.getByTestId("teacher-login-submit").click();
    await expect(page).toHaveURL(/\/teacher(?:\/grading)?\/?$/);
    await expect(page.getByTestId("teacher-grading-search")).toBeVisible();
}
