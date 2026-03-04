import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

test.describe("Teacher Session", () => {
    test("me endpoint returns teacher info after login", async ({ page }) => {
        await loginAsTeacher(page);

        const res = await page.request.get("/api/teacher/me");
        const json = (await res.json()) as ApiResponse<{
            id: number;
            name: string;
            role: string;
        }>;
        expect(json.success).toBe(true);
        expect(json.data!.id).toBeDefined();
        expect(json.data!.name).toBeTruthy();
    });

    test("me endpoint fails without authentication", async ({ page }) => {
        const res = await page.request.get("/api/teacher/me");
        const json = (await res.json()) as ApiResponse<null>;
        expect(json.success).toBe(false);
    });

    test("API calls fail after logout", async ({ page }) => {
        await loginAsTeacher(page);

        // Verify logged in
        const beforeRes = await page.request.get("/api/teacher/me");
        const beforeJson = (await beforeRes.json()) as ApiResponse<{ id: number }>;
        expect(beforeJson.success).toBe(true);

        // Logout
        await page.request.post("/api/teacher/logout");

        // Verify logged out
        const afterRes = await page.request.get("/api/teacher/me");
        const afterJson = (await afterRes.json()) as ApiResponse<null>;
        expect(afterJson.success).toBe(false);
    });
});
