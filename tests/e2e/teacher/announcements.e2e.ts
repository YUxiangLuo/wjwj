import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

test.describe("Teacher Announcements", () => {
    test("announcements API returns valid data", async ({ page }) => {
        await loginAsTeacher(page);

        const res = await page.request.get("/api/teacher/announcements");
        const json = (await res.json()) as ApiResponse<{
            announcements: Array<{ id: number; title: string; content: string }>;
        }>;
        expect(json.success).toBe(true);
        expect(json.data!.announcements).toBeDefined();
        expect(Array.isArray(json.data!.announcements)).toBe(true);
    });
});
