import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";

import { AuthLoginScreen } from "@/components/AuthLoginScreen";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/student/login").restore;
});

afterEach(() => cleanup());

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("shared auth screen preserves portal-specific ids, error associations, and links", () => {
    const view = render(
        <AuthLoginScreen
            portal="student"
            heading="学生登录"
            description="登录说明"
            accountLabel="学号"
            accountPlaceholder="请输入学号"
            resetHint="联系教师重置"
            username="S001"
            password="bad"
            loading={false}
            error="登录失败"
            alternateLinks={[
                { href: "/teacher/login", label: "教师登录" },
                { href: "/admin/login", label: "管理员登录" },
            ]}
            onUsernameChange={() => undefined}
            onPasswordChange={() => undefined}
            onSubmit={(event) => event.preventDefault()}
        />,
    );

    const alert = view.getByRole("alert");
    expect(alert.id).toBe("student-login-error");
    expect(view.getByTestId("student-login-username").getAttribute("aria-describedby")).toBe(alert.id);
    expect(view.getByTestId("student-login-password").getAttribute("aria-describedby")).toBe(alert.id);
    expect(view.getByRole("link", { name: "教师登录" }).getAttribute("href")).toBe("/teacher/login");
    expect(view.getByTestId("student-login-submit").className).toContain("shadow-emphasis");
});
