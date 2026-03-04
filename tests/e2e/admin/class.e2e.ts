import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin Class Management", () => {
    test("create, edit, and delete class", async ({ page }) => {
        const unique = String(Date.now()).slice(-6);
        const className = `E2EC-${unique}`;
        const editedClassName = `EC-${unique}`;

        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-class").click();
        await expect(page).toHaveURL(/\/admin\/class$/);

        await page.getByTestId("class-create-open").click();
        await page.getByTestId("class-create-name").fill(className);
        await page.getByTestId("class-create-submit").click();

        const createdRow = page.locator("tbody tr", { hasText: className });
        await expect(createdRow).toBeVisible();

        await createdRow.getByRole("button", { name: "编辑" }).click();
        await page.getByTestId("class-edit-name").fill(editedClassName);
        await page.getByTestId("class-edit-submit").click();

        const editedRow = page.locator("tbody tr", { hasText: editedClassName });
        await expect(editedRow).toBeVisible();

        page.once("dialog", (dialog) => dialog.accept());
        await editedRow.getByRole("button", { name: "删除" }).click();
        await expect(page.locator("tbody tr", { hasText: editedClassName })).toHaveCount(0);
    });
});
