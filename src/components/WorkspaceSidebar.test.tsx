import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;
let WorkspaceSidebar: typeof import("./WorkspaceSidebar").WorkspaceSidebar;

beforeAll(async () => {
    restoreDom = installDomGlobals("http://localhost/").restore;
    ({ WorkspaceSidebar } = await import("./WorkspaceSidebar"));
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("WorkspaceSidebar always renders the desktop navigation", () => {
    const view = render(
        <MemoryRouter>
            <WorkspaceSidebar
                title="测试工作台"
                titleIcon={LayoutDashboard}
                items={[{ path: "/", label: "概览", icon: LayoutDashboard }]}
                footer={<span>测试用户</span>}
            />
        </MemoryRouter>,
    );

    expect(view.getByRole("navigation", { name: "测试工作台主导航" })).toBeTruthy();
    expect(view.getByRole("link", { name: "概览" }).getAttribute("href")).toBe("/");
    expect(view.getByText("测试用户")).toBeTruthy();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
});
