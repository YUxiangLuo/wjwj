import { expect, test } from "@playwright/test";
import { loginAsStudent } from "./helpers";

test.describe("Student Profile", () => {
    test("displays profile information", async ({ page }) => {
        await loginAsStudent(page);

        // Navigate to profile via avatar menu
        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-nav-profile").click();
        await expect(page).toHaveURL(/\/student\/profile$/);

        // Profile page title
        await expect(page.getByText("个人信息")).toBeVisible();
        await expect(page.getByText("基础资料")).toBeVisible();

        // Verify profile data is displayed
        await expect(page.getByTestId("student-profile-name")).toHaveText("E2E学生");
        await expect(page.getByTestId("student-profile-id")).toHaveText("student");
        await expect(page.getByTestId("student-profile-class")).toHaveText("E2E 学生班级A");
    });

    test("shows password change form", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-nav-profile").click();
        await expect(page).toHaveURL(/\/student\/profile$/);

        // Password section
        await expect(page.getByText("修改密码")).toBeVisible();
        await expect(page.getByTestId("student-profile-password-current")).toBeVisible();
        await expect(page.getByTestId("student-profile-password-new")).toBeVisible();
        await expect(page.getByTestId("student-profile-password-confirm")).toBeVisible();
        await expect(page.getByTestId("student-profile-password-save")).toBeVisible();

        // Password strength indicator
        await expect(page.getByText("密码强度")).toBeVisible();
    });

    test("password validation rules are enforced", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-nav-profile").click();
        await expect(page).toHaveURL(/\/student\/profile$/);

        // Try saving with empty fields
        await page.getByTestId("student-profile-password-save").click();
        await expect(page.getByText("请填写完整信息")).toBeVisible();

        // Try saving with short password
        await page.getByTestId("student-profile-password-current").fill("123456");
        await page.getByTestId("student-profile-password-new").fill("short");
        await page.getByTestId("student-profile-password-confirm").fill("short");
        await page.getByTestId("student-profile-password-save").click();
        await expect(page.getByText("新密码长度至少为8位")).toBeVisible();

        // Try saving with mismatched passwords
        await page.getByTestId("student-profile-password-new").fill("StrongPwd123!@#");
        await page.getByTestId("student-profile-password-confirm").fill("DifferentPwd123!");
        await page.getByTestId("student-profile-password-save").click();
        await expect(page.getByText("两次输入的新密码不一致")).toBeVisible();
    });

    test("password strength indicator updates", async ({ page }) => {
        await loginAsStudent(page);

        await page.getByTestId("student-avatar").click();
        await page.getByTestId("student-nav-profile").click();
        await expect(page).toHaveURL(/\/student\/profile$/);

        // Type a strong password and verify strength indicator changes
        await page.getByTestId("student-profile-password-new").fill("MyStr0ng!Pass");
        await expect(page.getByText("✓ 至少8个字符")).toBeVisible();
        await expect(page.getByText("✓ 包含字母")).toBeVisible();
        await expect(page.getByText("✓ 包含数字")).toBeVisible();
        await expect(page.getByText("✓ 包含特殊字符")).toBeVisible();
        await expect(page.getByText("✓ 不包含学号")).toBeVisible();
        await expect(page.getByText("强")).toBeVisible();
    });
});
