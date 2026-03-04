import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

test.describe("Teacher Password Change", () => {
    test("rejects password change with wrong current password", async ({ page }) => {
        await loginAsTeacher(page);

        const res = await page.request.put("/api/teacher/password", {
            data: {
                currentPassword: "wrong-password",
                newPassword: "NewPass@123!",
            },
        });
        const json = (await res.json()) as ApiResponse<{ success: boolean }>;
        expect(json.success).toBe(false);
    });

    test("rejects weak new password without special characters", async ({ page }) => {
        await loginAsTeacher(page);

        const res = await page.request.put("/api/teacher/password", {
            data: {
                currentPassword: "123456",
                newPassword: "simple12",
            },
        });
        const json = (await res.json()) as ApiResponse<{ success: boolean }>;
        expect(json.success).toBe(false);
        expect(json.error?.code).toBe("VALIDATION_ERROR");
    });

    test("rejects new password shorter than 8 characters", async ({ page }) => {
        await loginAsTeacher(page);

        const res = await page.request.put("/api/teacher/password", {
            data: {
                currentPassword: "123456",
                newPassword: "Ab@1",
            },
        });
        const json = (await res.json()) as ApiResponse<{ success: boolean }>;
        expect(json.success).toBe(false);
        expect(json.error?.code).toBe("VALIDATION_ERROR");
    });

    test("rejects new password same as current password", async ({ page }) => {
        await loginAsTeacher(page);

        const res = await page.request.put("/api/teacher/password", {
            data: {
                currentPassword: "123456",
                newPassword: "123456",
            },
        });
        const json = (await res.json()) as ApiResponse<{ success: boolean }>;
        expect(json.success).toBe(false);
    });

    test("password change dialog opens from UI", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-change-password-open").click();
        await expect(page.getByRole("heading", { name: /修改密码/ })).toBeVisible();
    });
});
