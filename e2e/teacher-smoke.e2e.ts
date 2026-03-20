import { test, expect, type Page } from "@playwright/test";

test.describe("Teacher Panel Smoke Tests", () => {
  test.describe.configure({ mode: "serial" });

  const teacherUrl = "http://localhost:3000/teacher";

  async function loginAsTeacher(page: Page, username = "teacher", password = "123456") {
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

  test("Login with valid credentials", async ({ page }) => {
    await loginAsTeacher(page);
    
    // Teacher should be redirected to dashboard
    await page.waitForURL(/\/teacher\/?$/, { timeout: 5000 });
    await expect(page.getByRole('heading', { name: '教学概览', level: 2 })).toBeVisible();
  });

  test("Login with invalid credentials shows error", async ({ page }) => {
    await page.goto(teacherUrl);
    await page.fill('[data-testid="teacher-login-username"]', "teacher");
    await page.fill('[data-testid="teacher-login-password"]', "wrongpassword");
    await page.click('[data-testid="teacher-login-submit"]');
    
    await expect(page.locator('text=/账号或密码错误/')).toBeVisible();
  });

  test("Dashboard displays after login", async ({ page }) => {
    await loginAsTeacher(page);
    
    await expect(page.locator('text="教学概览"')).toBeVisible();
    await expect(page.locator('text="我的班级"')).toBeVisible();
    // Note: Dashboard shows "我的课题" in the KPI cards
    await expect(page.locator('text="待批改作业"')).toBeVisible();
  });

  test("Navigation menu works", async ({ page }) => {
    await loginAsTeacher(page);
    
    // Test navigation to class management
    await page.getByRole('link', { name: '班级管理' }).click();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/class/);
    await expect(page.getByRole('heading', { name: '班级管理', level: 2 }).first()).toBeVisible();
  });

  test("Class management page loads", async ({ page }) => {
    await loginAsTeacher(page);
    
    await page.getByRole('link', { name: '班级管理' }).click();
    await page.waitForTimeout(500);
    
    await expect(page.getByRole('heading', { name: '班级管理', level: 2 }).first()).toBeVisible();
  });

  test("Topic management page loads", async ({ page }) => {
    await loginAsTeacher(page);
    
    await page.getByRole('link', { name: '课题管理' }).click();
    await page.waitForTimeout(500);
    
    await expect(page.getByRole('heading', { name: '课题管理', level: 2 }).first()).toBeVisible();
  });

  test("Grading page loads", async ({ page }) => {
    await loginAsTeacher(page);
    
    await page.getByRole('link', { name: /作业批改/ }).click();
    await page.waitForTimeout(500);
    
    await expect(page.getByRole('heading', { name: '作业批改', level: 2 }).first()).toBeVisible();
  });

  test("Assistant management page loads", async ({ page }) => {
    await loginAsTeacher(page);
    
    await page.getByRole('link', { name: '助教管理' }).click();
    await page.waitForTimeout(500);
    
    await expect(page.getByRole('heading', { name: '助教管理', level: 2 }).first()).toBeVisible();
  });

  test("Logout functionality", async ({ page }) => {
    await loginAsTeacher(page);
    
    // Click logout button (from header menu)
    await page.getByRole('button', { name: /退出登录/ }).click();
    
    // Wait for redirect to login page (with or without confirmation dialog)
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
    await expect(page.locator('text="教师登录"')).toBeVisible();
  });
});
