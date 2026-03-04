import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type TopicItem = { id: number; name: string; status: number };

test.describe("Teacher Topic Detail", () => {
    test("can view topic detail with field mapping and attachments", async ({ page }) => {
        await loginAsTeacher(page);

        const topicsRes = await page.request.get("/api/teacher/topics");
        const topicsJson = (await topicsRes.json()) as ApiResponse<TopicItem[]>;
        expect(topicsJson.success).toBe(true);
        const publishedTopic = (topicsJson.data ?? []).find((item) => item.name === "E2E 抽样课题");
        expect(publishedTopic).toBeTruthy();

        const detailRes = await page.request.get(`/api/teacher/topics/${publishedTopic!.id}/detail`);
        const detailJson = (await detailRes.json()) as ApiResponse<{
            topic: { name: string; description: string; fieldMapping: Record<string, unknown> };
            attachments: Array<{ id: number; fileName: string }>;
            recommendQuestions: Array<{ id: number; content: string }>;
        }>;
        expect(detailJson.success).toBe(true);
        expect(detailJson.data!.topic.name).toBe("E2E 抽样课题");
        expect(detailJson.data!.topic.fieldMapping).toBeDefined();
    });

    test("can view topic detail page from UI", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-topic").click();
        await expect(page.getByTestId("teacher-topic-search")).toBeVisible();

        await page.getByTestId("teacher-topic-search").fill("E2E 抽样课题");
        const row = page.locator('[data-testid^="teacher-topic-row-"]', { hasText: "E2E 抽样课题" }).first();
        await expect(row).toBeVisible();

        await row.locator('[data-testid^="teacher-topic-view-"]').click();

        // The detail view or dialog should show topic info
        await expect(page.getByText("E2E 抽样课题")).toBeVisible();
    });
});
