import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type TaskItem = { id: number; deadline: string | null };

test.describe("Teacher Task Extend Validation", () => {
    test("rejects extending deadline to an earlier time", async ({ page }) => {
        await loginAsTeacher(page);

        const tasksRes = await page.request.get("/api/teacher/tasks");
        const tasksJson = (await tasksRes.json()) as ApiResponse<TaskItem[]>;
        expect(tasksJson.success).toBe(true);
        const taskWithDeadline = (tasksJson.data ?? []).find((item) => item.deadline);
        expect(taskWithDeadline).toBeTruthy();

        const oldDeadline = new Date(taskWithDeadline!.deadline!);
        const earlier = new Date(oldDeadline.getTime() - 24 * 60 * 60 * 1000).toISOString();

        const extendRes = await page.request.put(`/api/teacher/tasks/${taskWithDeadline!.id}/extend`, {
            data: { deadline: earlier },
        });
        const extendJson = (await extendRes.json()) as ApiResponse<{ success: boolean }>;

        expect(extendJson.success).toBe(false);
        expect(extendJson.error?.code).toBe("VALIDATION_ERROR");
    });
});
