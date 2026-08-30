import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;
let StudentLogin: ComponentType;
let TeacherLogin: ComponentType;
let AdminLogin: ComponentType;

beforeAll(async () => {
    restoreDom = installDomGlobals("http://localhost/").restore;
    [StudentLogin, TeacherLogin, AdminLogin] = await Promise.all([
        import("@/student/pages/Login").then((module) => module.Login),
        import("@/teacher/pages/Login").then((module) => module.Login),
        import("@/admin/pages/Login").then((module) => module.Login),
    ]);
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

for (const scenario of [
    { name: "student", Component: () => StudentLogin, username: "学号", password: "密码" },
    { name: "teacher", Component: () => TeacherLogin, username: "教师工号", password: "密码" },
    { name: "admin", Component: () => AdminLogin, username: "用户名", password: "密码" },
]) {
    test(`${scenario.name} login announces and associates validation errors`, async () => {
        const Login = scenario.Component();
        const view = render(<Login />);
        fireEvent.click(view.getByRole("button", { name: "安全登录" }));

        const alert = await waitFor(() => view.getByRole("alert"));
        expect(alert.textContent).toContain("密码");

        for (const input of [
            view.getByRole("textbox", { name: scenario.username }),
            view.getByLabelText(scenario.password),
        ]) {
            expect(input.getAttribute("aria-invalid")).toBe("true");
            expect(input.getAttribute("aria-describedby")).toBe(alert.id);
        }
    });
}
