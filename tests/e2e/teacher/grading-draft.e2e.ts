import { expect, test } from "@playwright/test";
import { loginAsTeacher, ensurePendingSubmissionId } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };

test.describe("Teacher Grading Draft", () => {
    test("can save grading as draft without finalizing", async ({ page }) => {
        await loginAsTeacher(page);

        const submissionId = await ensurePendingSubmissionId(page);

        await page.goto(`/teacher/grading/${submissionId}`);
        await expect(page.getByTestId("teacher-grading-score-questionnaire")).toBeVisible();

        await page.getByTestId("teacher-grading-score-questionnaire").fill("75");
        await page.getByTestId("teacher-grading-score-process").fill("80");
        await page.getByTestId("teacher-grading-score-report").fill("85");
        await page.getByTestId("teacher-grading-comment").fill("E2E 草稿保存测试：初步评审意见。");

        await page.getByTestId("teacher-grading-save-draft").click();

        // After draft save, status should remain pending (1)
        const checkRes = await page.request.get(`/api/teacher/grading/${submissionId}`);
        const checkJson = (await checkRes.json()) as ApiResponse<{ status: number; scoreQuestionnaire: string }>;
        expect(checkJson.success).toBe(true);
        expect(checkJson.data!.status).toBe(1);
    });
});
