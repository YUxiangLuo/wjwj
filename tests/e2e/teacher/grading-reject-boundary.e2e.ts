import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type GradingItem = { id: number; status: number };

async function ensurePendingSubmissionId(page: import("@playwright/test").Page) {
    const allRes = await page.request.get("/api/teacher/grading");
    const allJson = (await allRes.json()) as ApiResponse<GradingItem[]>;
    expect(allJson.success).toBe(true);
    const all = allJson.data ?? [];
    const pending = all.find((item) => item.status === 1);
    if (pending) return pending.id;

    const target = all[0]!;
    await page.request.get(`/api/teacher/grading/${target.id}`);
    await page.request.post(`/api/teacher/grading/${target.id}`, {
        data: {
            scoreQuestionnaire: 60,
            scoreProcess: 60,
            scoreReport: 60,
            totalScore: 60,
            comment: "E2E reset pending",
            status: 1,
        },
    });
    return target.id;
}

test.describe("Teacher Grading Reject Boundary", () => {
    test("reject reason enforces minimum length", async ({ page }) => {
        await loginAsTeacher(page);
        const submissionId = await ensurePendingSubmissionId(page);

        await page.request.get(`/api/teacher/grading/${submissionId}`);

        const tooShortRes = await page.request.post(`/api/teacher/grading/${submissionId}`, {
            data: {
                scoreQuestionnaire: 60,
                scoreProcess: 60,
                scoreReport: 60,
                totalScore: 60,
                comment: "E2E reject boundary",
                status: 3,
                rejectReason: "太短原因123",
            },
        });
        const tooShortJson = (await tooShortRes.json()) as ApiResponse<{ success: boolean }>;
        expect(tooShortJson.success).toBe(false);
        expect(tooShortJson.error?.code).toBe("VALIDATION_ERROR");

        const validRes = await page.request.post(`/api/teacher/grading/${submissionId}`, {
            data: {
                scoreQuestionnaire: 60,
                scoreProcess: 60,
                scoreReport: 60,
                totalScore: 60,
                comment: "E2E reject boundary",
                status: 3,
                rejectReason: "边界校验通过：这是10字以上驳回原因。",
            },
        });
        const validJson = (await validRes.json()) as ApiResponse<{ success: boolean }>;
        expect(validJson.success).toBe(true);
    });
});
