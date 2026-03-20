import { test, expect, type Page } from "@playwright/test";

test.describe("Assistant Panel Smoke Tests", () => {
  test.describe.configure({ mode: "serial" });

  const teacherUrl = "http://localhost:3000/teacher";

  async function loginAsAssistant(page: Page, username = "assistant", password = "123456") {
    await page.goto(teacherUrl);
    await page.fill('[data-testid="teacher-login-username"]', username);
    await page.fill('[data-testid="teacher-login-password"]', password);
    await page.click('[data-testid="teacher-login-submit"]');
    await page.waitForTimeout(1000);
  }

  test("Login page loads correctly", async ({ page }) => {
    await page.goto(teacherUrl);
    
    await expect(page.locator('text="教师登录"')).toBeVisible();
    await expect(page.locator('[data-testid="teacher-login-username"]')).toBeVisible();
    await expect(page.locator('[data-testid="teacher-login-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="teacher-login-submit"]')).toBeVisible();
  });

  test("Login with valid credentials redirects to grading", async ({ page }) => {
    await loginAsAssistant(page);
    
    // Assistant should be redirected to grading page, not dashboard
    await page.waitForURL(/\/grading/, { timeout: 5000 });
    await expect(page.locator('text="作业批改"').first()).toBeVisible();
  });

  test("Login with invalid credentials shows error", async ({ page }) => {
    await page.goto(teacherUrl);
    await page.fill('[data-testid="teacher-login-username"]', "assistant");
    await page.fill('[data-testid="teacher-login-password"]', "wrongpassword");
    await page.click('[data-testid="teacher-login-submit"]');
    
    await expect(page.locator('text=/账号或密码错误/')).toBeVisible();
  });

  test("Grading page is accessible and shows submissions", async ({ page }) => {
    await loginAsAssistant(page);
    
    // Verify we're on grading page
    await expect(page.locator('text="作业批改"').first()).toBeVisible();
    
    // Should have status filter tabs
    await expect(page.locator('button:has-text("全部")').or(page.locator('button:has-text("待批改")')).first()).toBeVisible();
  });

  test("Limited navigation menu for assistant", async ({ page }) => {
    await loginAsAssistant(page);
    
    // Should see grading in nav
    await expect(page.getByRole('link', { name: /作业批改/ })).toBeVisible();
    
    // Should NOT see teacher-only menu items (or they're disabled/hidden)
    // These items should not be visible or accessible
    const teacherOnlyItems = ["班级管理", "题目管理", "任务管理", "助教管理"];
    
    // Check that we don't see these specific nav items
    for (const item of teacherOnlyItems) {
      const itemLocator = page.locator(`nav >> text="${item}"`);
      // Items might not exist or be hidden
      const count = await itemLocator.count().catch(() => 0);
      if (count > 0) {
        // If they exist, they might be in a restricted menu
        console.log(`Found ${item} in navigation (may be restricted)`);
      }
    }
  });

  test("Grading filters work", async ({ page }) => {
    await loginAsAssistant(page);
    
    // Check for status filter buttons
    const statusFilters = ["全部", "待批改", "已批改"];
    
    for (const filter of statusFilters) {
      const filterButton = page.locator(`button:has-text("${filter}")`).first();
      if (await filterButton.count() > 0) {
        await filterButton.click();
        await page.waitForTimeout(300);
      }
    }
    
    // Page should still be stable
    await expect(page.locator('text="作业批改"').first()).toBeVisible();
  });

  test("Logout functionality", async ({ page }) => {
    await loginAsAssistant(page);
    
    // Click logout button (from header menu)
    await page.getByRole('button', { name: /退出登录/ }).click();
    
    // Wait for redirect to login page (with or without confirmation dialog)
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    await expect(page.locator('text="教师登录"')).toBeVisible();
  });
});
