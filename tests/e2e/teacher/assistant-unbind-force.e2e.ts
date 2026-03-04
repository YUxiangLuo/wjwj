import { expect, test } from "@playwright/test";
import { loginAsAssistant, loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type AssistantItem = { id: number; studentId: string; assignedClassIds: number[] };
type GradingItem = { id: number };

test.describe("Teacher Assistant Force Unbind", () => {
    test("can force unbind after HAS_DRAFTS prompt", async ({ browser, baseURL }) => {
        const teacherContext = await browser.newContext({ baseURL });
        const assistantContext = await browser.newContext({ baseURL });
        const teacherPage = await teacherContext.newPage();
        const assistantPage = await assistantContext.newPage();

        await loginAsTeacher(teacherPage);

        const assistantsRes = await teacherPage.request.get("/api/teacher/assistants");
        const assistantsJson = (await assistantsRes.json()) as ApiResponse<AssistantItem[]>;
        const ast = (assistantsJson.data ?? []).find((item) => item.studentId === "assistant");
        expect(ast).toBeTruthy();
        expect((ast?.assignedClassIds ?? []).length).toBeGreaterThan(0);

        await loginAsAssistant(assistantPage);
        const pendingRes = await assistantPage.request.get("/api/teacher/grading?status=pending");
        const pendingJson = (await pendingRes.json()) as ApiResponse<GradingItem[]>;
        const submissionId = pendingJson.data?.[0]?.id;
        expect(submissionId).toBeTruthy();

        await assistantPage.request.get(`/api/teacher/grading/${submissionId}`);
        await assistantPage.request.post(`/api/teacher/grading/${submissionId}`, {
            data: {
                scoreQuestionnaire: 80,
                scoreProcess: 80,
                scoreReport: 80,
                totalScore: 80,
                comment: "E2E 助教草稿",
                status: 0,
            },
        });

        await teacherPage.goto("/teacher/assistant");
        const row = teacherPage.locator('[data-testid^="teacher-assistant-row-"]', { hasText: "assistant" }).first();
        await row.locator('[data-testid^="teacher-assistant-assign-open-"]').click();

        for (const classId of ast!.assignedClassIds) {
            const checkbox = teacherPage.getByTestId(`teacher-assistant-assign-check-${classId}`);
            if (await checkbox.isChecked()) {
                await checkbox.uncheck();
            }
        }

        await teacherPage.getByTestId("teacher-assistant-assign-submit").click();
        await expect(teacherPage.getByTestId("teacher-assistant-force-unbind-submit")).toBeVisible();
        await teacherPage.getByTestId("teacher-assistant-force-unbind-submit").click();

        const updatedRes = await teacherPage.request.get("/api/teacher/assistants");
        const updatedJson = (await updatedRes.json()) as ApiResponse<AssistantItem[]>;
        const updated = (updatedJson.data ?? []).find((item) => item.studentId === "assistant");
        expect(updated).toBeTruthy();
        expect(updated?.assignedClassIds.length ?? -1).toBe(0);

        const restoreRes = await teacherPage.request.post(`/api/teacher/assistants/${ast!.id}/classes`, {
            data: {
                classIds: ast!.assignedClassIds,
                force: true,
            },
        });
        const restoreJson = (await restoreRes.json()) as ApiResponse<{ success: boolean }>;
        expect(restoreJson.success).toBe(true);

        await teacherContext.close();
        await assistantContext.close();
    });
});
