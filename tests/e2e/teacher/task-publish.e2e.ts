import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";

type ApiResponse<T> = { success: boolean; data?: T; error?: { code: string; message: string } };
type TaskItem = { id: number };
type ClassItem = { id: number; name: string };

test.describe("Teacher Task Publish", () => {
    test("duplicate topic-class publish does not create new task", async ({ page }) => {
        await loginAsTeacher(page);

        const beforeRes = await page.request.get("/api/teacher/tasks");
        const beforeJson = (await beforeRes.json()) as ApiResponse<TaskItem[]>;
        expect(beforeJson.success).toBe(true);
        const beforeCount = (beforeJson.data ?? []).length;

        const classesRes = await page.request.get("/api/teacher/classes");
        const classesJson = (await classesRes.json()) as ApiResponse<ClassItem[]>;
        expect(classesJson.success).toBe(true);
        const classA = (classesJson.data ?? []).find((item) => item.name === "E2E 教师班级A");
        expect(classA).toBeTruthy();

        await page.goto("/teacher/task");
        await expect(page.getByTestId("teacher-task-publish-open")).toBeVisible();
        await page.getByTestId("teacher-task-publish-open").click();

        await page.getByTestId("teacher-task-topic-select").click();
        await page.getByRole("option", { name: "E2E 抽样课题" }).click();

        await page.getByTestId(`teacher-task-class-check-${classA!.id}`).check();
        await page.getByTestId("teacher-task-publish-submit").click();

        const afterRes = await page.request.get("/api/teacher/tasks");
        const afterJson = (await afterRes.json()) as ApiResponse<TaskItem[]>;
        expect(afterJson.success).toBe(true);
        const afterCount = (afterJson.data ?? []).length;

        expect(afterCount).toBe(beforeCount);
    });
});
