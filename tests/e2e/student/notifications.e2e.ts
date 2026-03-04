import { expect, test } from "@playwright/test";
import { loginAsStudent } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type NotificationsData = { unreadCount: number };

test.describe("Student Notifications", () => {
    test("can open notifications dialog", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-open-notifications").click();
        await expect(page.getByRole("heading", { name: "通知" })).toBeVisible();
    });

    test("notifications are displayed with content", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-open-notifications").click();
        await expect(page.getByRole("heading", { name: "通知" })).toBeVisible();

        // Should show notification content from seed data
        await expect(page.getByText("作业已批改")).toBeVisible();
        await expect(page.getByText("作业被驳回")).toBeVisible();
    });

    test("can mark all notifications as read", async ({ page }) => {
        await loginAsStudent(page);

        // Check initial unread count via API
        const beforeRes = await page.request.get("/api/student/notifications");
        const beforeJson = (await beforeRes.json()) as ApiResponse<NotificationsData>;
        expect(beforeJson.success).toBe(true);
        expect(beforeJson.data?.unreadCount ?? 0).toBeGreaterThan(0);

        await page.getByTestId("student-open-notifications").click();
        await expect(page.getByRole("heading", { name: "通知" })).toBeVisible();

        // Click "全部已读"
        await Promise.all([
            page.waitForResponse((res) => res.url().includes("/api/student/notifications/read-all") && res.request().method() === "PUT" && res.ok()),
            page.getByTestId("student-notification-read-all").click(),
        ]);

        // Verify unread count is now 0
        await expect
            .poll(async () => {
                const afterRes = await page.request.get("/api/student/notifications");
                const afterJson = (await afterRes.json()) as ApiResponse<NotificationsData>;
                return afterJson.data?.unreadCount ?? 0;
            })
            .toBe(0);
    });
});
