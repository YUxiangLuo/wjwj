import { expect, test } from "@playwright/test";
import { loginAsTeacher, ensurePendingSubmissionId } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

test.describe("Teacher Grading Score Validation", () => {
    test("rejects scores outside 0-100 range via API", async ({ page }) => {
        await loginAsTeacher(page);

        const submissionId = await ensurePendingSubmissionId(page);

        await page.request.get(`/api/teacher/grading/${submissionId}`);

        const overRes = await page.request.post(`/api/teacher/grading/${submissionId}`, {
            data: {
                scoreQuestionnaire: 150,
                scoreProcess: 80,
                scoreReport: 80,
                totalScore: 80,
                comment: "E2E score validation",
                status: 2,
            },
        });
        const overJson = (await overRes.json()) as ApiResponse<{ success: boolean }>;
        expect(overJson.success).toBe(false);
        expect(overJson.error?.code).toBe("VALIDATION_ERROR");
    });

    test("rejects negative scores via API", async ({ page }) => {
        await loginAsTeacher(page);

        const submissionId = await ensurePendingSubmissionId(page);

        await page.request.get(`/api/teacher/grading/${submissionId}`);

        const negRes = await page.request.post(`/api/teacher/grading/${submissionId}`, {
            data: {
                scoreQuestionnaire: -10,
                scoreProcess: 80,
                scoreReport: 80,
                totalScore: 80,
                comment: "E2E score validation",
                status: 2,
            },
        });
        const negJson = (await negRes.json()) as ApiResponse<{ success: boolean }>;
        expect(negJson.success).toBe(false);
        expect(negJson.error?.code).toBe("VALIDATION_ERROR");
    });
});
