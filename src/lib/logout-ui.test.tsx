import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { installDomGlobals } from "../test-utils/dom";

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => { await act(async () => cleanup()); globalThis.fetch = originalFetch; dom?.restore(); });
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }

for (const role of ["student", "teacher", "admin"] as const) {
    test(`${role}: failed logout keeps the workspace and an explicit retry can log out`, async () => {
        dom = installDomGlobals();
        let fail = true;
        globalThis.fetch = (async (url: string) => {
            if (url.endsWith("/logout")) {
                if (fail) throw new TypeError("offline");
                return Response.json({ success: true, data: { ok: true } });
            }
            if (url.endsWith("/me")) return Response.json({ success: true, data: {
                id: 1, name: "会话测试", studentId: "S1", employeeId: "T1", username: "admin", classId: 1,
            } });
            return Response.json({ success: true, data: [] });
        }) as unknown as typeof fetch;
        const App = role === "student" ? (await import("../student/StudentApp")).StudentApp
            : role === "teacher" ? (await import("../teacher/TeacherApp")).TeacherApp
            : (await import("../admin/AdminApp")).AdminApp;
        const initial = role === "student" ? "/profile" : role === "teacher" ? "/class" : "/teacher";
        const view = render(<MemoryRouter initialEntries={[initial]}><Location /><App /></MemoryRouter>);
        const logout = async () => {
            if (role === "student") {
                fireEvent.click(await view.findByRole("button", { name: "打开账户菜单" }));
                fireEvent.click(await view.findByRole("button", { name: "退出登录" }));
                fireEvent.click(await view.findByRole("button", { name: "退出" }));
            } else fireEvent.click(await view.findByRole("button", { name: "退出登录" }));
        };
        await logout();
        await waitFor(() => expect(view.getByText("尚未安全退出，请检查网络后重试。不要将设备交给他人。")).toBeTruthy());
        expect(view.getByTestId("location").textContent).toBe(initial);
        fail = false;
        await logout();
        await waitFor(() => expect(view.getByTestId("location").textContent).toBe("/login"));
    });
}
