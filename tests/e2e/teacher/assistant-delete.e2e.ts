import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

test.describe("Teacher Assistant Delete", () => {
    test("can delete assistant and deleted assistant cannot login", async ({ page }) => {
        await loginAsTeacher(page);

        const suffix = Date.now().toString().slice(-6);
        const account = `del${suffix}`;
        const name = `删除助教${suffix}`;

        const createRes = await page.request.post("/api/teacher/assistants", {
            data: { studentId: account, name },
        });
        const createJson = (await createRes.json()) as ApiResponse<{ success: boolean }>;
        expect(createJson.success).toBe(true);

        await page.goto("/teacher/assistant");
        const row = page.locator('[data-testid^="teacher-assistant-row-"]', { hasText: account }).first();
        await expect(row).toBeVisible();

        await row.locator('[data-testid^="teacher-assistant-delete-"]').click();
        await page.getByRole("button", { name: "确认移除" }).click();

        await expect(row).toContainText("已删除");

        await page.getByTestId("teacher-logout").click();
        await expect(page).toHaveURL(/\/teacher\/login$/);

        await page.getByTestId("teacher-login-username").fill(account);
        await page.getByTestId("teacher-login-password").fill("123456");
        await page.getByTestId("teacher-login-submit").click();

        await expect(page.getByText(/账号已被停用/)).toBeVisible();
    });
});
