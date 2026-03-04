import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type TopicItem = { id: number; name: string };

test.describe("Teacher Topic Advanced", () => {
    test("can copy and delete topic, and published mapping update is forbidden", async ({ page }) => {
        await loginAsTeacher(page);

        const topicsRes = await page.request.get("/api/teacher/topics");
        const topicsJson = (await topicsRes.json()) as ApiResponse<TopicItem[]>;
        expect(topicsJson.success).toBe(true);
        const baseTopic = (topicsJson.data ?? []).find((item) => item.name === "E2E 市场分析课题");
        expect(baseTopic).toBeTruthy();

        const copyRes = await page.request.post(`/api/teacher/topics/${baseTopic!.id}/copy`);
        const copyJson = (await copyRes.json()) as ApiResponse<{ id: number }>;
        expect(copyJson.success).toBe(true);
        const copiedTopicId = copyJson.data!.id;

        const afterCopyRes = await page.request.get("/api/teacher/topics");
        const afterCopyJson = (await afterCopyRes.json()) as ApiResponse<TopicItem[]>;
        expect(afterCopyJson.success).toBe(true);
        expect((afterCopyJson.data ?? []).some((item) => item.id === copiedTopicId)).toBe(true);

        const publishedTopic = (afterCopyJson.data ?? []).find((item) => item.name === "E2E 抽样课题");
        expect(publishedTopic).toBeTruthy();

        const forbiddenRes = await page.request.put(`/api/teacher/topics/${publishedTopic!.id}/mapping`, {
            data: {
                fieldMapping: {
                    identifier: "id",
                    stratified: ["gender"],
                    numeric: ["age"],
                    others: ["income"],
                },
            },
        });
        const forbiddenJson = (await forbiddenRes.json()) as ApiResponse<{ success: boolean }>;
        expect(forbiddenJson.success).toBe(false);
        expect(forbiddenJson.error?.code).toBe("FORBIDDEN");

        const deleteRes = await page.request.delete(`/api/teacher/topics/${copiedTopicId}`);
        const deleteJson = (await deleteRes.json()) as ApiResponse<{ success: boolean }>;
        expect(deleteJson.success).toBe(true);

        const afterDeleteRes = await page.request.get("/api/teacher/topics");
        const afterDeleteJson = (await afterDeleteRes.json()) as ApiResponse<TopicItem[]>;
        expect(afterDeleteJson.success).toBe(true);
        expect((afterDeleteJson.data ?? []).some((item) => item.id === copiedTopicId)).toBe(false);
    });
});
