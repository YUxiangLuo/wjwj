import { expect, type Page } from "@playwright/test";

export async function loginAsStudent(page: Page) {
    await page.goto("/student/login");
    await page.getByTestId("student-login-username").fill("student");
    await page.getByTestId("student-login-password").fill("123456");
    await page.getByTestId("student-login-submit").click();
    await expect(page).toHaveURL(/\/student\/?$/);
    await expect(page.getByText("我的任务")).toBeVisible();
}
