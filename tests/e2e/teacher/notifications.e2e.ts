import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type NotificationsData = { unreadCount: number };

test.describe("Teacher Notifications", () => {
    test("can read all notifications", async ({ page }) => {
        await loginAsTeacher(page);

        const beforeRes = await page.request.get("/api/teacher/notifications");
        const beforeJson = (await beforeRes.json()) as ApiResponse<NotificationsData>;
        expect(beforeJson.success).toBe(true);
        expect((beforeJson.data?.unreadCount ?? 0)).toBeGreaterThan(0);

        await page.getByTestId("teacher-open-notifications").click();
        await expect(page.getByRole("heading", { name: "通知" })).toBeVisible();
        await Promise.all([
            page.waitForResponse((res) => res.url().includes("/api/teacher/notifications/read-all") && res.request().method() === "PUT" && res.ok()),
            page.getByTestId("teacher-notification-read-all").click(),
        ]);

        await expect
            .poll(async () => {
                const afterRes = await page.request.get("/api/teacher/notifications");
                const afterJson = (await afterRes.json()) as ApiResponse<NotificationsData>;
                return afterJson.data?.unreadCount ?? 0;
            })
            .toBe(0);
    });
});
