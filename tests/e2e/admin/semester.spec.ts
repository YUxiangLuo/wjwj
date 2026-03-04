import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin Semester Management", () => {
    test("create, edit, and set current semester", async ({ page }) => {
        const unique = String(Date.now()).slice(-6);
        const semesterName = `E2E-${unique}`;
        const renamedSemesterName = `R-${unique}`;

        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-semester").click();
        await expect(page).toHaveURL(/\/admin\/semester$/);

        await page.getByTestId("semester-create-open").click();
        await page.getByTestId("semester-create-name").fill(semesterName);
        await page.getByTestId("semester-create-submit").click();

        const createdRow = page.locator("tbody tr", { hasText: semesterName });
        await expect(createdRow).toBeVisible();

        await createdRow.getByRole("button", { name: "编辑" }).click();
        await page.getByTestId("semester-edit-name").fill(renamedSemesterName);
        await page.getByTestId("semester-edit-submit").click();

        const renamedRow = page.locator("tbody tr", { hasText: renamedSemesterName });
        await expect(renamedRow).toBeVisible();

        await renamedRow.getByRole("button", { name: "设为当前" }).click();
        await expect(renamedRow.getByText("当前学期")).toBeVisible();

    });
});
