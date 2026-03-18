import { test, expect, type Page } from "@playwright/test";

test.describe("Admin Panel Smoke Tests", () => {
  // Use serial mode for login-dependent tests
  test.describe.configure({ mode: "serial" });

  const adminUrl = "http://localhost:3000/admin";

  async function loginAsAdmin(page: Page, username = "admin", password = "123456") {
    await page.goto(adminUrl);
    await page.fill('[data-testid="admin-login-username"]', username);
    await page.fill('[data-testid="admin-login-password"]', password);
    await page.click('[data-testid="admin-login-submit"]');
    // Wait for navigation to dashboard or password change modal
    await page.waitForTimeout(1000);
  }

  test("Login page loads correctly", async ({ page }) => {
    await page.goto(adminUrl);
    
    // Check page title and form elements
    await expect(page.locator('text="管理员登录"')).toBeVisible();
    await expect(page.locator('[data-testid="admin-login-username"]')).toBeVisible();
    await expect(page.locator('[data-testid="admin-login-password"]')).toBeVisible();
    await expect(page.locator('[data-testid="admin-login-submit"]')).toBeVisible();
  });

  test("Login with valid credentials", async ({ page }) => {
    await loginAsAdmin(page);
    
    // Should be redirected to admin dashboard (check for dashboard-specific elements)
    // Wait for navigation to complete
    await page.waitForURL(/\/admin\/?$/, { timeout: 5000 });
    
    // Dashboard should show KPI cards with labels
    await expect(page.locator('text="当前学期"')).toBeVisible({ timeout: 5000 });
  });

  test("Login with invalid credentials shows error", async ({ page }) => {
    await page.goto(adminUrl);
    await page.fill('[data-testid="admin-login-username"]', "admin");
    await page.fill('[data-testid="admin-login-password"]', "wrongpassword");
    await page.click('[data-testid="admin-login-submit"]');
    
    // Should show error message (may include remaining attempts count)
    await expect(page.locator('text=/用户名或密码错误/')).toBeVisible();
  });

  test("Dashboard displays after login", async ({ page }) => {
    await loginAsAdmin(page);
    
    // Check dashboard elements (using text content that exists on dashboard)
    await expect(page.locator('text="当前学期"')).toBeVisible();
    await expect(page.locator('text="教师总数"')).toBeVisible();
    await expect(page.locator('text="学生总数"')).toBeVisible();
    // Check page heading (h2 for dashboard title)
    await expect(page.getByRole('heading', { name: '首页概览', level: 2 })).toBeVisible();
  });

  test("Navigation menu works", async ({ page }) => {
    await loginAsAdmin(page);
    
    // Test sidebar navigation to key pages
    const menuItems = [
      { name: "学期管理", url: "/semester", heading: "学期管理" },
      { name: "教师管理", url: "/teacher", heading: "教师管理" },
      { name: "班级管理", url: "/class", heading: "班级管理" },
    ];
    
    for (const item of menuItems.slice(0, 3)) { // Test first 3 to keep test fast
      await page.click(`text="${item.name}"`);
      await page.waitForTimeout(500);
      
      // Verify URL changed
      await expect(page).toHaveURL(new RegExp(item.url));
      
      // Verify page loaded with expected heading
      await expect(page.locator(`text="${item.heading}"`).first()).toBeVisible();
    }
  });

  test("Logout functionality", async ({ page }) => {
    await loginAsAdmin(page);
    
    // Look for and click logout button (top-right area)
    const logoutButton = page.getByRole('button', { name: /退出登录/ });
    await logoutButton.click();
    
    // Handle confirmation dialog
    await page.getByRole('button', { name: '退出' }).click();
    
    // Should be redirected to login page
    await expect(page).toHaveURL(/\/login/, { timeout: 3000 });
    await expect(page.locator('text="管理员登录"')).toBeVisible();
  });

  test("Teacher management page loads and displays data", async ({ page }) => {
    await loginAsAdmin(page);
    
    // Navigate to teacher management
    await page.click('text="教师管理"');
    await page.waitForTimeout(500);
    
    // Verify page loaded
    await expect(page.locator('text="教师管理"').first()).toBeVisible();
    
    // Check for add button or search input
    const addButton = page.locator('button:has-text("添加")').or(page.locator('button:has-text("新增")')).first();
    await expect(addButton).toBeVisible();
  });

  test("System settings page loads", async ({ page }) => {
    await loginAsAdmin(page);
    
    // Navigate to settings
    await page.click('text="系统设置"');
    await page.waitForTimeout(500);
    
    // Verify page loaded
    await expect(page.locator('text="系统设置"').first()).toBeVisible();
    
    // Check for settings tabs/buttons
    await expect(page.locator('button:has-text("基本设置")')).toBeVisible();
  });

  test("Announcement management page loads", async ({ page }) => {
    await loginAsAdmin(page);
    
    // Navigate to announcements
    await page.click('text="公告管理"');
    await page.waitForTimeout(500);
    
    // Verify page loaded
    await expect(page.locator('text="公告管理"').first()).toBeVisible();
    
    // Check for tabs or add button
    const tabsOrButton = page.locator('button:has-text("全部")').or(page.locator('button:has-text("发布")')).or(page.locator('button:has-text("新增")')).first();
    await expect(tabsOrButton).toBeVisible();
  });
});
