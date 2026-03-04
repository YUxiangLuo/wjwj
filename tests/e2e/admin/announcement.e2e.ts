import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test.describe("Admin Announcement Management", () => {
    test("create draft, edit, publish, unpublish, and delete announcement", async ({ page }) => {
        const unique = String(Date.now()).slice(-6);
        const title = `公告${unique}`;
        const editedTitle = `改${unique}`;

        await loginAsAdmin(page);
        await page.getByTestId("admin-nav-announcement").click();
        await expect(page).toHaveURL(/\/admin\/announcement$/);

        await page.getByTestId("announcement-create-open").click();
        const createDialog = page.getByRole("dialog", { name: "发布公告" });
        await createDialog.getByTestId("announcement-create-title").fill(title);
        await createDialog.getByTestId("announcement-create-content").fill("E2E 公告内容");
        await createDialog.getByTestId("announcement-create-draft").click();

        const cardTitle = page.locator("h4", { hasText: title }).first();
        await expect(cardTitle).toBeVisible();
        const card = cardTitle.locator("xpath=ancestor::div[contains(@class,'border') and contains(@class,'rounded-lg')][1]");
        await expect(card.getByRole("button", { name: "发布", exact: true })).toBeVisible();

        await card.getByRole("button", { name: "编辑" }).click();
        const editDialog = page.getByRole("dialog", { name: "编辑公告" });
        await editDialog.getByTestId("announcement-edit-title").fill(editedTitle);
        await editDialog.getByTestId("announcement-edit-submit").click();

        const editedCardTitle = page.locator("h4", { hasText: editedTitle }).first();
        await expect(editedCardTitle).toBeVisible();
        const editedCard = editedCardTitle.locator("xpath=ancestor::div[contains(@class,'border') and contains(@class,'rounded-lg')][1]");
        await expect(editedCard).toBeVisible();

        page.once("dialog", (dialog) => dialog.accept());
        await editedCard.getByRole("button", { name: "发布", exact: true }).click();
        await expect(editedCard.getByRole("button", { name: "撤回", exact: true })).toBeVisible();

        await editedCard.getByRole("button", { name: "统计", exact: true }).click();
        const statsDialog = page.getByRole("dialog", { name: "公告阅读统计" });
        await expect(statsDialog).toBeVisible();
        await expect(statsDialog.getByText("总人数")).toBeVisible();
        await expect(statsDialog.getByText("已阅读")).toBeVisible();
        await expect(statsDialog.getByText("阅读率")).toBeVisible();
        await statsDialog.getByTestId("announcement-stats-close").click();

        page.once("dialog", (dialog) => dialog.accept());
        await editedCard.getByRole("button", { name: "撤回", exact: true }).click();
        await expect(editedCard.getByRole("button", { name: "发布", exact: true })).toBeVisible();

        page.once("dialog", (dialog) => dialog.accept());
        await editedCard.getByRole("button", { name: "删除" }).click();
        await expect(page.locator("div", { hasText: editedTitle }).filter({ has: page.getByRole("button", { name: "编辑" }) })).toHaveCount(0);
    });
});
