import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";
import { createTempCsvFixture } from "../fixtures/files";

test.describe("Teacher Student Import", () => {
    test("shows mixed import result for valid and invalid rows", async ({ page }) => {
        await loginAsTeacher(page);

        await page.goto("/teacher/class");
        await expect(page.getByTestId("teacher-class-search")).toBeVisible();
        await page.locator('[data-testid^="teacher-class-manage-students-"]').first().click();
        await expect(page.getByTestId("teacher-student-import-open")).toBeVisible();

        const validId = `imp${Date.now().toString().slice(-7)}`;
        const csv = [
            "studentId,name,email",
            "student-e2e,重复学生,dup@example.com",
            `${validId},导入成功,ok@example.com`,
            "missing-name,,bad@example.com",
        ].join("\n");

        const filePath = await createTempCsvFixture("teacher-import", csv);

        await page.getByTestId("teacher-student-import-open").click();
        await page.getByTestId("teacher-student-import-file").setInputFiles(filePath);
        await page.getByTestId("teacher-student-import-submit").click();

        await expect(page.getByText("成功：1 条")).toBeVisible();
        await expect(page.getByText("失败：2 条")).toBeVisible();

        await page.getByRole("button", { name: "取消" }).click();
        await expect(page.locator("tr", { hasText: validId })).toBeVisible();
    });
});
