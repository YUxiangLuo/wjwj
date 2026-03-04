import { expect, test } from "@playwright/test";
import { loginAsTeacher } from "./helpers";
import { getPopulationXlsxPath } from "../fixtures/files";

test.describe("Teacher Topic Management", () => {
    test("can create a topic through 6-step flow and publish it", async ({ page }) => {
        await loginAsTeacher(page);

        await page.getByTestId("teacher-nav-topic").click();
        await expect(page).toHaveURL(/\/teacher\/topic$/);
        await expect(page.getByTestId("teacher-topic-search")).toBeVisible();

        const suffix = Date.now().toString().slice(-6);
        const topicName = `E2E课题-${suffix}`;

        await page.getByTestId("teacher-topic-create-open").click();

        await page.getByTestId("teacher-topic-name").fill(topicName);
        await page.getByTestId("teacher-topic-desc").fill("E2E 自动化创建课题，覆盖六步向导流程。");
        await page.getByTestId("teacher-topic-next").click();

        await expect(page.getByTestId("teacher-topic-step-2")).toBeVisible();
        const populationFile = getPopulationXlsxPath();
        await page.getByTestId("teacher-topic-excel-file").setInputFiles(populationFile);
        await page.getByTestId("teacher-topic-next").click();
        await expect(page.getByTestId("teacher-topic-mapping-identifier")).toBeVisible();

        await page.getByTestId("teacher-topic-mapping-identifier").click();
        await page.getByRole("option").first().click();
        const stratified = page.locator('[data-testid^="teacher-topic-mapping-stratified-"]');
        const numeric = page.locator('[data-testid^="teacher-topic-mapping-numeric-"]');
        await expect(stratified.first()).toBeVisible();
        await expect(numeric.first()).toBeVisible();
        const stratifiedGender = page.getByTestId("teacher-topic-mapping-stratified-gender");
        if (await stratifiedGender.count()) {
            await stratifiedGender.check();
        } else {
            await stratified.first().check();
        }
        const numericAge = page.getByTestId("teacher-topic-mapping-numeric-age");
        if (await numericAge.count()) {
            await numericAge.check();
        } else {
            await numeric.nth(1).check();
        }
        await page.getByTestId("teacher-topic-next").click();
        await expect(page.getByTestId("teacher-topic-attachment-file")).toBeVisible();

        await page.getByTestId("teacher-topic-next").click();
        await expect(page.getByTestId("teacher-topic-question-add")).toBeVisible();

        await page.getByTestId("teacher-topic-question-add").click();
        await page.locator('[data-testid^="teacher-topic-question-content-"]').first().fill("您对本次抽样方案的满意度如何？");
        await page.getByTestId("teacher-topic-next").click();

        await page.getByTestId("teacher-topic-weight-questionnaire").fill("30");
        await page.getByTestId("teacher-topic-weight-process").fill("30");
        await page.getByTestId("teacher-topic-weight-report").fill("40");
        await page.getByTestId("teacher-topic-finish").click();

        await expect(page.getByRole("dialog")).toHaveCount(0);

        await page.getByTestId("teacher-topic-search").fill(topicName);
        const row = page.locator('[data-testid^="teacher-topic-row-"]', { hasText: topicName }).first();
        await expect(row).toBeVisible();

        await row.locator('[data-testid^="teacher-topic-publish-"]').click();
        const confirm = page.getByRole("alertdialog");
        await expect(confirm).toBeVisible();
        await confirm.getByRole("button", { name: "确认" }).click();

        await expect(row.getByText("已发布")).toBeVisible();
    });
});
