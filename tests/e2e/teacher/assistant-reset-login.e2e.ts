import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

test.describe("Teacher Assistant Reset Password", () => {
    test("assistant can login with account after teacher reset", async ({ page }) => {
        await loginAsTeacher(page);

        const suffix = Date.now().toString().slice(-6);
        const account = `rst${suffix}`;
        const name = `重置助教${suffix}`;

        const createRes = await page.request.post("/api/teacher/assistants", {
            data: { studentId: account, name },
        });
        const createJson = (await createRes.json()) as ApiResponse<{ success: boolean }>;
        expect(createJson.success).toBe(true);

        await page.goto("/teacher/assistant");
        const row = page.locator('[data-testid^="teacher-assistant-row-"]', { hasText: account }).first();
        await expect(row).toBeVisible();

        await row.locator('[data-testid^="teacher-assistant-reset-"]').click();

        await page.getByTestId("teacher-logout").click();
        await expect(page).toHaveURL(/\/teacher\/login$/);

        await page.getByTestId("teacher-login-username").fill(account);
        await page.getByTestId("teacher-login-password").fill(account);
        await page.getByTestId("teacher-login-submit").click();

        await expect(page).toHaveURL(/\/teacher(?:\/grading)?\/?$/);
        await expect(page.getByTestId("teacher-grading-search")).toBeVisible();
    });
});
