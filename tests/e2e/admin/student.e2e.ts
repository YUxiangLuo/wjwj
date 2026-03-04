import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin Student Management", () => {
    test("filter, transfer student, and toggle status", async ({ page }) => {
        const unique = String(Date.now()).slice(-6);
        const targetClassName = `TR-${unique}`;

        await loginAsAdmin(page);

        await page.getByTestId("admin-nav-class").click();
        await page.getByTestId("class-create-open").click();
        await page.getByTestId("class-create-name").fill(targetClassName);
        await page.getByTestId("class-create-submit").click();
        await expect(page.locator("tbody tr", { hasText: targetClassName })).toBeVisible();

        await page.getByTestId("admin-nav-student").click();
        await expect(page).toHaveURL(/\/admin\/student$/);

        await page.getByTestId("student-search-input").fill("student");
        await page.getByTestId("student-search-refresh").click();

        const studentRow = page.locator("tbody tr", { hasText: "student" }).first();
        await expect(studentRow).toBeVisible();

        await studentRow.getByRole("button", { name: "转班" }).click();
        const transferDialog = page.getByRole("dialog", { name: "学生转班" });
        await expect(transferDialog).toBeVisible();
        await transferDialog.getByRole("combobox").click();
        await page.getByRole("option", { name: targetClassName }).click();
        await transferDialog.getByTestId("student-transfer-submit").click();

        const transferredRow = page.locator("tbody tr", { hasText: "student" }).first();
        await expect(transferredRow).toContainText(targetClassName);

        page.once("dialog", (dialog) => dialog.accept());
        await transferredRow.getByRole("button", { name: "停用" }).click();
        await expect(transferredRow.getByText("已停用")).toBeVisible();

        page.once("dialog", (dialog) => dialog.accept());
        await transferredRow.getByRole("button", { name: "启用" }).click();
        await expect(transferredRow.getByText("正常")).toBeVisible();
    });

    test("search student by student ID", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-student").click();

        await page.getByTestId("student-search-input").fill("student");
        await page.getByTestId("student-search-refresh").click();

        const studentRow = page.locator("tbody tr", { hasText: "student" }).first();
        await expect(studentRow).toBeVisible();
        await expect(studentRow).toContainText("E2E学生");
    });

    test("student page shows summary stats", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-student").click();

        await expect(page.getByText("学生总数")).toBeVisible();
    });
});
