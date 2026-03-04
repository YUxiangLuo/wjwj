import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

test.describe("Teacher Topic Weight Validation", () => {
    test("rejects weights that do not sum to 100", async ({ page }) => {
        await loginAsTeacher(page);

        const createRes = await page.request.post("/api/teacher/topics", {
            data: {
                name: `权重校验-${Date.now()}`,
                description: "E2E 权重校验",
                status: 0,
            },
        });
        const createJson = (await createRes.json()) as ApiResponse<{ id: number }>;
        expect(createJson.success).toBe(true);
        const topicId = createJson.data!.id;

        const invalidRes = await page.request.put(`/api/teacher/topics/${topicId}/weights`, {
            data: {
                weightConfig: {
                    questionnaire: 30,
                    process: 30,
                    report: 30,
                },
            },
        });
        const invalidJson = (await invalidRes.json()) as ApiResponse<{ success: boolean }>;
        expect(invalidJson.success).toBe(false);
        expect(invalidJson.error?.code).toBe("VALIDATION_ERROR");

        // Clean up
        await page.request.delete(`/api/teacher/topics/${topicId}`);
    });

    test("accepts weights that sum to 100", async ({ page }) => {
        await loginAsTeacher(page);

        const createRes = await page.request.post("/api/teacher/topics", {
            data: {
                name: `权重通过-${Date.now()}`,
                description: "E2E 权重通过",
                status: 0,
            },
        });
        const createJson = (await createRes.json()) as ApiResponse<{ id: number }>;
        expect(createJson.success).toBe(true);
        const topicId = createJson.data!.id;

        const validRes = await page.request.put(`/api/teacher/topics/${topicId}/weights`, {
            data: {
                weightConfig: {
                    questionnaire: 30,
                    process: 30,
                    report: 40,
                },
            },
        });
        const validJson = (await validRes.json()) as ApiResponse<{ success: boolean }>;
        expect(validJson.success).toBe(true);

        // Clean up
        await page.request.delete(`/api/teacher/topics/${topicId}`);
    });
});
