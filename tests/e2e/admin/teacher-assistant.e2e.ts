import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin Teacher and Assistant Management", () => {
    test("create teacher, toggle status, and create/delete assistant", async ({ page }) => {
        const unique = Date.now();
        const teacherEmployeeId = `E2E_T_${unique}`;
        const teacherName = `教师${unique}`;
        const assistantAccount = `e2e_a_${unique}`;
        const assistantName = `助教${unique}`;

        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-teacher").click();
        await expect(page).toHaveURL(/\/admin\/teacher$/);

        await page.getByTestId("teacher-create-open").click();
        await page.getByTestId("teacher-create-employee-id").fill(teacherEmployeeId);
        await page.getByTestId("teacher-create-name").fill(teacherName);
        await page.getByTestId("teacher-create-submit").click();

        await page.getByTestId("teacher-search-input").fill(teacherEmployeeId);
        await page.getByTestId("teacher-search-submit").click();

        const teacherRow = page.locator("tbody tr", { hasText: teacherEmployeeId });
        await expect(teacherRow).toBeVisible();

        page.once("dialog", (dialog) => dialog.accept());
        await teacherRow.getByRole("button", { name: "停用" }).click();
        await expect(teacherRow.getByText("已停用")).toBeVisible();

        page.once("dialog", (dialog) => dialog.accept());
        await teacherRow.getByRole("button", { name: "启用" }).click();
        await expect(teacherRow.getByText("正常")).toBeVisible();

        await page.getByTestId("admin-nav-assistant").click();
        await expect(page).toHaveURL(/\/admin\/assistant$/);

        await page.getByTestId("assistant-create-open").click();
        await page.getByTestId("assistant-create-account").fill(assistantAccount);
        await page.getByTestId("assistant-create-name").fill(assistantName);
        await page.getByTestId("assistant-create-submit").click();

        const assistantRow = page.locator("tbody tr", { hasText: assistantAccount });
        await expect(assistantRow).toBeVisible();

        page.once("dialog", (dialog) => dialog.accept());
        await assistantRow.getByRole("button", { name: "删除" }).click();
        await expect(page.locator("tbody tr", { hasText: assistantAccount })).toHaveCount(0);
    });
});
