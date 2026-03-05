import { expect, type Page } from "@playwright/test";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type GradingItem = { id: number; status: number };

export async function ensurePendingSubmissionId(page: Page) {
    const allRes = await page.request.get("/api/teacher/grading");
    const allJson = (await allRes.json()) as ApiResponse<GradingItem[]>;
    expect(allJson.success).toBe(true);
    const all = allJson.data ?? [];
    const pending = all.find((item) => item.status === 1);
    if (pending) return pending.id;

    // Also accept draft (status=0) submissions as valid targets
    const draft = all.find((item) => item.status === 0);
    if (draft) return draft.id;

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

export async function loginAsTeacher(page: Page) {
    await page.goto("/teacher/login");
    await page.getByTestId("teacher-login-username").fill("teacher");
    await page.getByTestId("teacher-login-password").fill("123456");
    await page.getByTestId("teacher-login-submit").click();
    await expect(page).toHaveURL(/\/teacher\/?$/);
    await expect(page.getByRole("heading", { name: "首页概览" })).toBeVisible();
}

export async function loginAsAssistant(page: Page) {
    await page.goto("/teacher/login");
    await page.getByTestId("teacher-login-username").fill("assistant");
    await page.getByTestId("teacher-login-password").fill("123456");
    await page.getByTestId("teacher-login-submit").click();
    await expect(page).toHaveURL(/\/teacher(?:\/grading)?\/?$/);
    await expect(page.getByTestId("teacher-grading-search")).toBeVisible();
}
