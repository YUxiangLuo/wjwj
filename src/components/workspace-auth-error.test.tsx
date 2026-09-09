import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { AdminApp } from "@/admin/AdminApp";
import { TeacherApp } from "@/teacher/TeacherApp";
const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => { await act(async () => cleanup()); mock.restore(); globalThis.fetch = originalFetch; dom?.restore(); });
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }
for (const [role, App] of [["admin", AdminApp], ["teacher", TeacherApp]] as const) for (const failure of ["500", "network"]) {
    test(`${role}: ${failure} preserves route and offers retry, 401 redirects`, async () => {
        dom = installDomGlobals(); let attempts = 0;
        const reload = spyOn(window.location, "reload").mockImplementation(() => {});
        globalThis.fetch = (async () => {
            if (++attempts > 1) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "请登录" } }, { status: 401 });
            if (failure === "network") throw new TypeError("Failed to fetch");
            return Response.json({ success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } }, { status: 500 });
        }) as unknown as typeof fetch;
        let view = render(<MemoryRouter initialEntries={["/teacher"]}><Location /><App /></MemoryRouter>);
        await waitFor(() => expect(view.getByRole("alert").textContent).toContain("暂时无法确认登录状态"));
        expect(view.getByTestId("location").textContent).toBe("/teacher");
        fireEvent.click(view.getByRole("button", { name: "重试加载" }));
        expect(reload).toHaveBeenCalledTimes(1);
        expect(attempts).toBe(1);
        view.unmount();
        view = render(<MemoryRouter initialEntries={["/teacher"]}><Location /><App /></MemoryRouter>);
        await waitFor(() => expect(view.getByTestId("location").textContent).toBe("/login"));
    });
}
