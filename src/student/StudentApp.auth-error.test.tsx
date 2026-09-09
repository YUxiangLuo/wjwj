import { afterEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";
import { StudentApp } from "./StudentApp";

const originalFetch = globalThis.fetch;
let dom: ReturnType<typeof installDomGlobals>;
afterEach(async () => { await act(async () => cleanup()); globalThis.fetch = originalFetch; dom?.restore(); });
function Location() { return <output data-testid="location">{useLocation().pathname}</output>; }

for (const failure of ["500", "network"]) {
    test(`${failure} during initial authentication keeps the experiment URL and offers retry; real401 redirects`, async () => {
        dom = installDomGlobals();
        let attempts = 0;
        globalThis.fetch = (async () => {
            attempts++;
            if (attempts > 1) return Response.json({ success: false, error: { code: "UNAUTHORIZED", message: "请登录" } }, { status: 401 });
            if (failure === "network") throw new TypeError("Failed to fetch");
            return Response.json({ success: false, error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } }, { status: 500 });
        }) as unknown as typeof fetch;
        const view = render(<MemoryRouter initialEntries={["/task/1/experiment"]}><Location /><StudentApp /></MemoryRouter>);
        await waitFor(() => expect(view.getByRole("alert").textContent).toContain("暂时无法确认登录状态"));
        expect(view.getByTestId("location").textContent).toBe("/task/1/experiment");
        expect(view.queryByText("学生登录")).toBeNull();
        fireEvent.click(view.getByRole("button", { name: "重试加载" }));
        await waitFor(() => expect(view.getByTestId("location").textContent).toBe("/login"));
        expect(view.getByText("学生登录")).toBeTruthy();
        expect(attempts).toBe(2);
    });
}
