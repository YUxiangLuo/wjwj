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

    expect(all.length).toBeGreaterThan(0);
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

test.describe("Teacher Grading Reject", () => {
    test("can reject a submission with reason", async ({ page }) => {
        await loginAsTeacher(page);
        const submissionId = await ensurePendingSubmissionId(page);

        await page.goto(`/teacher/grading/${submissionId}`);
        await expect(page.getByTestId("teacher-grading-reject-open")).toBeVisible();

        await page.getByTestId("teacher-grading-reject-open").click();
        await page.getByTestId("teacher-grading-reject-reason").fill("E2E 驳回：请补充抽样依据与误差分析说明。 ");
        await page.getByTestId("teacher-grading-reject-submit").click();

        await expect(page).toHaveURL(/\/teacher\/grading$/);

        const allRes = await page.request.get("/api/teacher/grading");
        const allJson = (await allRes.json()) as ApiResponse<Array<{ id: number; status: number }>>;
        expect(allJson.success).toBe(true);
        const changed = (allJson.data ?? []).find((item) => item.id === submissionId);
        expect(changed?.status).toBe(3);
    });
});
