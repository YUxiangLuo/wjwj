import { expect, test } from "@playwright/test";
import { loginAsAssistant, loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type AssistantItem = { id: number; studentId: string; assignedClassIds: number[] };
type GradingItem = { id: number };

test.describe("Teacher Assistant Unbind", () => {
    test("shows HAS_DRAFTS confirm when unbinding classes with assistant drafts", async ({ browser, baseURL }) => {
        const teacherContext = await browser.newContext({ baseURL });
        const assistantContext = await browser.newContext({ baseURL });
        const teacherPage = await teacherContext.newPage();
        const assistantPage = await assistantContext.newPage();

        await loginAsTeacher(teacherPage);

        const assistantsRes = await teacherPage.request.get("/api/teacher/assistants");
        const assistantsJson = (await assistantsRes.json()) as ApiResponse<AssistantItem[]>;
        expect(assistantsJson.success).toBe(true);
        const defaultAssistant = (assistantsJson.data ?? []).find((item) => item.studentId === "assistant");
        expect(defaultAssistant).toBeTruthy();
        expect((defaultAssistant?.assignedClassIds ?? []).length).toBeGreaterThan(0);

        await loginAsAssistant(assistantPage);
        const pendingRes = await assistantPage.request.get("/api/teacher/grading?status=pending");
        const pendingJson = (await pendingRes.json()) as ApiResponse<GradingItem[]>;
        expect(pendingJson.success).toBe(true);
        expect((pendingJson.data ?? []).length).toBeGreaterThan(0);
        const submissionId = pendingJson.data![0]!.id;

        await assistantPage.request.get(`/api/teacher/grading/${submissionId}`);
        const saveDraftRes = await assistantPage.request.post(`/api/teacher/grading/${submissionId}`, {
            data: {
                scoreQuestionnaire: 80,
                scoreProcess: 80,
                scoreReport: 80,
                totalScore: 80,
                comment: "E2E 助教草稿",
                status: 0,
            },
        });
        const saveDraftJson = (await saveDraftRes.json()) as ApiResponse<{ success: boolean }>;
        expect(saveDraftJson.success).toBe(true);

        await teacherPage.goto("/teacher/assistant");
        await expect(teacherPage.getByTestId("teacher-assistant-search")).toBeVisible();

        const row = teacherPage.locator('[data-testid^="teacher-assistant-row-"]', { hasText: "assistant" }).first();
        await expect(row).toBeVisible();
        await row.locator('[data-testid^="teacher-assistant-assign-open-"]').click();

        for (const classId of defaultAssistant!.assignedClassIds) {
            const checkbox = teacherPage.getByTestId(`teacher-assistant-assign-check-${classId}`);
            if (await checkbox.isChecked()) {
                await checkbox.uncheck();
            }
        }

        await teacherPage.getByTestId("teacher-assistant-assign-submit").click();
        await expect(teacherPage.getByTestId("teacher-assistant-force-unbind-submit")).toBeVisible();

        await teacherContext.close();
        await assistantContext.close();
    });
});
