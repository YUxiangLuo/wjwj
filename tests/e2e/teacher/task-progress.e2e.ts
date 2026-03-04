import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type TaskItem = { id: number; topicName: string; className: string };

test.describe("Teacher Task Progress", () => {
    test("can navigate to task progress page and view student list", async ({ page }) => {
        await loginAsTeacher(page);

        const tasksRes = await page.request.get("/api/teacher/tasks");
        const tasksJson = (await tasksRes.json()) as ApiResponse<TaskItem[]>;
        expect(tasksJson.success).toBe(true);
        expect((tasksJson.data ?? []).length).toBeGreaterThan(0);
        const task = tasksJson.data![0]!;

        await page.goto(`/teacher/task/${task.id}/progress`);

        await expect(page.getByText("返回列表")).toBeVisible();
        await expect(page.getByText(task.topicName)).toBeVisible();
        await expect(page.getByText(task.className)).toBeVisible();
    });

    test("task progress API returns status counts", async ({ page }) => {
        await loginAsTeacher(page);

        const tasksRes = await page.request.get("/api/teacher/tasks");
        const tasksJson = (await tasksRes.json()) as ApiResponse<TaskItem[]>;
        expect(tasksJson.success).toBe(true);
        const task = tasksJson.data![0]!;

        const progressRes = await page.request.get(`/api/teacher/tasks/${task.id}/progress`);
        const progressJson = (await progressRes.json()) as ApiResponse<{
            task: { topicName: string; className: string };
            counts: Record<string, number>;
            students: Array<{ studentId: string; name: string; status: string }>;
        }>;
        expect(progressJson.success).toBe(true);
        expect(progressJson.data!.task.topicName).toBeTruthy();
        expect(progressJson.data!.counts).toBeDefined();
        expect(progressJson.data!.students).toBeDefined();
    });

    test("back button returns to task list", async ({ page }) => {
        await loginAsTeacher(page);

        const tasksRes = await page.request.get("/api/teacher/tasks");
        const tasksJson = (await tasksRes.json()) as ApiResponse<TaskItem[]>;
        const task = tasksJson.data![0]!;

        await page.goto(`/teacher/task/${task.id}/progress`);
        await expect(page.getByText("返回列表")).toBeVisible();

        await page.getByText("返回列表").click();
        await expect(page).toHaveURL(/\/teacher\/task$/);
    });
});
