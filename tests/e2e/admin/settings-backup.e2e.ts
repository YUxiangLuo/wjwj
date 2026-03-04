import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin Settings Backup", () => {
    test("open backup section, trigger backup, and open restore dialog", async ({ page }) => {
        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-settings").click();
        await expect(page).toHaveURL(/\/admin\/settings$/);

        await page.getByTestId("settings-section-backup").click();
        await expect(page.getByTestId("settings-backup-create")).toBeVisible();

        await page.getByTestId("settings-backup-create").click();
        await page.waitForFunction(() => {
            const text = document.body.innerText;
            return text.includes("最近备份ID：") || text.includes("备份失败");
        }, null, { timeout: 20_000 });

        await page.getByTestId("settings-backup-restore-open").click();
        const restoreDialog = page.getByRole("dialog", { name: "恢复备份" });
        await expect(restoreDialog).toBeVisible();
        await expect(restoreDialog.getByLabel("管理员密码", { exact: true })).toBeVisible();

        const noBackupHint = restoreDialog.getByText("暂无可用备份");
        if (await noBackupHint.count()) {
            await expect(noBackupHint).toBeVisible();
        } else {
            await expect(restoreDialog.getByText("备份时间：")).toBeVisible();
        }
    });
});
