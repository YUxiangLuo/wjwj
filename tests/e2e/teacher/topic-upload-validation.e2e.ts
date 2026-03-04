import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";
import { createCsvBuffer } from "../fixtures/files";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

test.describe("Teacher Topic Upload Validation", () => {
    test("rejects excel upload with only one column", async ({ page }) => {
        await loginAsTeacher(page);

        const createRes = await page.request.post("/api/teacher/topics", {
            data: {
                name: `Upload校验-${Date.now()}`,
                description: "E2E 上传校验",
                status: 0,
            },
        });
        const createJson = (await createRes.json()) as ApiResponse<{ id: number }>;
        expect(createJson.success).toBe(true);
        const topicId = createJson.data!.id;

        const invalidCsv = createCsvBuffer(["id", "1", "2", "3"]);
        const uploadRes = await page.request.post(`/api/teacher/topics/${topicId}/excel`, {
            multipart: {
                file: {
                    name: "invalid-one-column.csv",
                    mimeType: "text/csv",
                    buffer: invalidCsv,
                },
            },
        });
        const uploadJson = (await uploadRes.json()) as ApiResponse<{ success: boolean }>;

        expect(uploadJson.success).toBe(false);
        expect(uploadJson.error?.code).toBe("VALIDATION_ERROR");
    });
});
