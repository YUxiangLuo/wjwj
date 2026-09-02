import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { LayoutDashboard } from "lucide-react";
import { MemoryRouter } from "react-router-dom";

import { WorkspaceShell } from "@/components/WorkspaceShell";
import { installDomGlobals } from "@/test-utils/dom";

let restoreDom: (() => void) | null = null;

beforeAll(() => {
    restoreDom = installDomGlobals("http://localhost/").restore;
});

afterEach(() => cleanup());

afterAll(() => {
    restoreDom?.();
    restoreDom = null;
});

test("workspace shell owns the shared desktop frame without owning route content", () => {
    const view = render(
        <MemoryRouter>
            <WorkspaceShell
                sidebarTitle="测试工作台"
                sidebarIcon={LayoutDashboard}
                menuItems={[{ path: "/", label: "概览", icon: LayoutDashboard }]}
                sidebarFooter={<span>测试用户</span>}
                pageTitle="当前页面"
                pageSubtitle="系统副标题"
                headerActions={<button type="button">退出</button>}
            >
                <p>路由内容</p>
            </WorkspaceShell>
        </MemoryRouter>,
    );

    expect(view.getByRole("navigation", { name: "测试工作台主导航" })).toBeTruthy();
    expect(view.getByRole("heading", { name: "当前页面" })).toBeTruthy();
    expect(view.getByText("系统副标题")).toBeTruthy();
    expect(view.getByText("路由内容").closest("#main-content")).toBeTruthy();
    expect(view.getByRole("button", { name: "退出" })).toBeTruthy();
    expect(view.getByText("跳到主要内容").className).toContain("rounded-control");
    expect(view.getByText("跳到主要内容").className).toContain("shadow-floating");
});
