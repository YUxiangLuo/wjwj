import { expect, test } from "@playwright/test";
import { loginAsStudent } from "./helpers";

test.describe("Student Password Change (Modal)", () => {
    test("can open password change modal from header menu", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-open-password-modal").click();

        await expect(page.getByRole("heading", { name: "修改密码" })).toBeVisible();
        await expect(page.getByTestId("student-password-current")).toBeVisible();
        await expect(page.getByTestId("student-password-new")).toBeVisible();
        await expect(page.getByTestId("student-password-confirm")).toBeVisible();
    });

    test("modal password validation - empty fields", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-open-password-modal").click();

        await page.getByTestId("student-password-save").click();
        await expect(page.getByText("请填写完整信息")).toBeVisible();
    });

    test("modal password validation - too short", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-open-password-modal").click();

        await page.getByTestId("student-password-current").fill("123456");
        await page.getByTestId("student-password-new").fill("Ab1!");
        await page.getByTestId("student-password-confirm").fill("Ab1!");
        await page.getByTestId("student-password-save").click();
        await expect(page.getByText("新密码长度至少为8位")).toBeVisible();
    });

    test("modal password validation - missing special chars", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-open-password-modal").click();

        await page.getByTestId("student-password-current").fill("123456");
        await page.getByTestId("student-password-new").fill("Abcdefg123");
        await page.getByTestId("student-password-confirm").fill("Abcdefg123");
        await page.getByTestId("student-password-save").click();
        await expect(page.getByText("新密码需包含字母、数字和特殊字符")).toBeVisible();
    });

    test("modal password validation - contains student ID", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-open-password-modal").click();

        // "student" is the student ID
        await page.getByTestId("student-password-current").fill("123456");
        await page.getByTestId("student-password-new").fill("student!Abc123");
        await page.getByTestId("student-password-confirm").fill("student!Abc123");
        await page.getByTestId("student-password-save").click();
        await expect(page.getByText("新密码不能包含学号")).toBeVisible();
    });

    test("modal password validation - mismatch", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-open-password-modal").click();

        await page.getByTestId("student-password-current").fill("123456");
        await page.getByTestId("student-password-new").fill("NewPass!123ok");
        await page.getByTestId("student-password-confirm").fill("Different!123ok");
        await page.getByTestId("student-password-save").click();
        await expect(page.getByText("两次输入的新密码不一致")).toBeVisible();
    });

    test("modal password strength indicator", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-open-password-modal").click();

        // Type a strong password
        await page.getByTestId("student-password-new").fill("MyS3cure!Pass");
        await expect(page.getByText("✓ 至少8个字符")).toBeVisible();
        await expect(page.getByText("✓ 包含字母")).toBeVisible();
        await expect(page.getByText("✓ 包含数字")).toBeVisible();
        await expect(page.getByText("✓ 包含特殊字符")).toBeVisible();
    });
});
