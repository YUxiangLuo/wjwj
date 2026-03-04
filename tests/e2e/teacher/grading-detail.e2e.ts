import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type GradingItem = { id: number; status: number };

async function ensurePendingSubmissionId(page: import("@playwright/test").Page) {
    const allRes = await page.request.get("/api/teacher/grading");
    const allJson = (await allRes.json()) as ApiResponse<GradingItem[]>;
    expect(allJson.success).toBe(true);
    const all = allJson.data ?? [];
    const existingPending = all.find((item) => item.status === 1);
    if (existingPending) return existingPending.id;

    expect(all.length).toBeGreaterThan(0);
    const target = all[0]!;

    await page.request.get(`/api/teacher/grading/${target.id}`);
    const toPendingRes = await page.request.post(`/api/teacher/grading/${target.id}`, {
        data: {
            scoreQuestionnaire: 60,
            scoreProcess: 60,
            scoreReport: 60,
            totalScore: 60,
            comment: "E2E reset pending",
            status: 1,
        },
    });
    const toPendingJson = (await toPendingRes.json()) as ApiResponse<{ success: boolean }>;
    expect(toPendingJson.success).toBe(true);
    return target.id;
}

test.describe("Teacher Grading Detail", () => {
    test("can grade a pending submission", async ({ page }) => {
        await loginAsTeacher(page);

        const submissionId = await ensurePendingSubmissionId(page);

        await page.getByTestId("teacher-nav-grading").click();
        await expect(page).toHaveURL(/\/teacher\/grading$/);
        await expect(page.getByTestId("teacher-grading-search")).toBeVisible();

        await page.goto(`/teacher/grading/${submissionId}`);
        await expect(page).toHaveURL(new RegExp(`/teacher/grading/${submissionId}$`));

        await page.getByTestId("teacher-grading-score-questionnaire").fill("88");
        await page.getByTestId("teacher-grading-score-process").fill("90");
        await page.getByTestId("teacher-grading-score-report").fill("92");
        await page.getByTestId("teacher-grading-comment").fill("E2E 自动化评分：结构完整，分析较清晰。");

        await page.getByTestId("teacher-grading-submit").click();

        await expect(page).toHaveURL(/\/teacher\/grading$/);

        const pendingRes = await page.request.get("/api/teacher/grading?status=pending");
        const pendingJson = (await pendingRes.json()) as ApiResponse<Array<{ id: number }>>;
        expect(pendingJson.success).toBe(true);
        const pendingIds = (pendingJson.data ?? []).map((item) => item.id);
        expect(pendingIds.includes(submissionId)).toBe(false);
    });
});
