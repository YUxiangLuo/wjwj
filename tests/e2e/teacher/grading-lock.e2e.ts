import { expect, test } from "@playwright/test";
import { loginAsAssistant, loginAsTeacher } from "./helpers";

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

test.describe("Teacher Grading Lock", () => {
    test("shows readonly mode when submission is locked by another user", async ({ browser, baseURL }) => {
        const teacherContext = await browser.newContext({ baseURL });
        const assistantContext = await browser.newContext({ baseURL });
        const teacherPage = await teacherContext.newPage();
        const assistantPage = await assistantContext.newPage();

        await loginAsTeacher(teacherPage);
        const submissionId = await ensurePendingSubmissionId(teacherPage);

        await teacherPage.goto(`/teacher/grading/${submissionId}`);
        await expect(teacherPage.getByTestId("teacher-grading-submit")).toBeVisible();

        await loginAsAssistant(assistantPage);
        await assistantPage.goto(`/teacher/grading/${submissionId}`);

        await expect(assistantPage.getByTestId("teacher-grading-readonly-banner")).toBeVisible();
        await expect(assistantPage.getByTestId("teacher-grading-submit")).toBeDisabled();

        await teacherContext.close();
        await assistantContext.close();
    });
});
