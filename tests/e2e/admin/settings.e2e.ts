import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin System Settings", () => {
    test("update and persist general/security settings", async ({ page }) => {
        const unique = String(Date.now()).slice(-6);
        const systemName = `系统${unique}`;

        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-settings").click();
        await expect(page).toHaveURL(/\/admin\/settings$/);

        await page.getByTestId("settings-system-name").fill(systemName);
        await page.getByTestId("settings-save").click();
        await expect(page.getByText("设置已保存").first()).toBeVisible();

        await page.getByTestId("settings-section-security").click();
        await page.getByTestId("settings-max-login-attempts").fill("7");
        await page.getByTestId("settings-lock-duration").fill("25");
        await page.getByTestId("settings-save").click();
        await expect(page.getByText("设置已保存").first()).toBeVisible();

        await page.reload();
        await expect(page.getByTestId("settings-system-name")).toHaveValue(systemName);

        await page.getByTestId("settings-section-security").click();
        await expect(page.getByTestId("settings-max-login-attempts")).toHaveValue("7");
        await expect(page.getByTestId("settings-lock-duration")).toHaveValue("25");
    });

    test("update experiment settings", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-settings").click();

        await page.getByTestId("settings-section-experiment").click();
        await expect(page.getByText("实验设置")).toBeVisible();

        const timeLimitInput = page.locator("#experimentTimeLimit");
        const autoSaveInput = page.locator("#autoSaveInterval");
        await expect(timeLimitInput).toBeVisible();
        await expect(autoSaveInput).toBeVisible();

        await timeLimitInput.fill("120");
        await autoSaveInput.fill("10");
        await page.getByTestId("settings-save").click();
        await expect(page.getByText("设置已保存").first()).toBeVisible();

        await page.reload();
        await page.getByTestId("settings-section-experiment").click();
        await expect(page.locator("#experimentTimeLimit")).toHaveValue("120");
        await expect(page.locator("#autoSaveInterval")).toHaveValue("10");
    });

    test("update file limits settings", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-settings").click();

        await page.getByTestId("settings-section-file-limits").click();
        await expect(page.getByText("文件限制")).toBeVisible();

        const excelMaxRowsInput = page.locator("#excelMaxRows");
        const maxAttachmentInput = page.locator("#maxAttachmentSizeMb");
        const batchImportInput = page.locator("#batchImportMaxRows");
        await expect(excelMaxRowsInput).toBeVisible();
        await expect(maxAttachmentInput).toBeVisible();
        await expect(batchImportInput).toBeVisible();

        await excelMaxRowsInput.fill("50000");
        await maxAttachmentInput.fill("20");
        await batchImportInput.fill("500");
        await page.getByTestId("settings-save").click();
        await expect(page.getByText("设置已保存").first()).toBeVisible();

        await page.reload();
        await page.getByTestId("settings-section-file-limits").click();
        await expect(page.locator("#excelMaxRows")).toHaveValue("50000");
        await expect(page.locator("#maxAttachmentSizeMb")).toHaveValue("20");
        await expect(page.locator("#batchImportMaxRows")).toHaveValue("500");
    });

    test("update notification settings", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-settings").click();

        await page.getByTestId("settings-section-notifications").click();
        await expect(page.getByText("通知设置")).toBeVisible();

        const deadlineInput = page.locator("#deadlineReminderHours");
        const retentionInput = page.locator("#notificationRetentionDays");
        await expect(deadlineInput).toBeVisible();
        await expect(retentionInput).toBeVisible();

        await deadlineInput.fill("48");
        await retentionInput.fill("60");
        await page.getByTestId("settings-save").click();
        await expect(page.getByText("设置已保存").first()).toBeVisible();

        await page.reload();
        await page.getByTestId("settings-section-notifications").click();
        await expect(page.locator("#deadlineReminderHours")).toHaveValue("48");
        await expect(page.locator("#notificationRetentionDays")).toHaveValue("60");
    });

    test("security section shows session timeout fields", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-settings").click();

        await page.getByTestId("settings-section-security").click();

        const adminTimeout = page.locator("#adminSessionTimeout");
        const teacherTimeout = page.locator("#teacherSessionTimeout");
        const studentTimeout = page.locator("#studentSessionTimeout");
        await expect(adminTimeout).toBeVisible();
        await expect(teacherTimeout).toBeVisible();
        await expect(studentTimeout).toBeVisible();
    });

    test("security section has change password button", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-settings").click();

        await page.getByTestId("settings-section-security").click();

        const changePwdBtn = page.getByRole("button", { name: "修改管理员密码" });
        await expect(changePwdBtn).toBeVisible();

        await changePwdBtn.click();
        await expect(page.getByRole("dialog", { name: "修改管理员密码" })).toBeVisible();
    });

    test("can navigate between all settings sections", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-settings").click();

        for (const section of ["general", "experiment", "security", "file-limits", "notifications", "backup"]) {
            await page.getByTestId(`settings-section-${section}`).click();
            await expect(page.getByTestId(`settings-section-${section}`)).toBeVisible();
        }
    });
});
