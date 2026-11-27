import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { BarChart3 } from "lucide-react";
import { MemoryRouter } from "react-router-dom";

import { AuthLoginScreen } from "@/components/AuthLoginScreen";
import { KpiStatCard } from "@/components/KpiStatCard";
import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import { StatusBadge } from "@/components/StatusBadge";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { Button, IconButton } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { installDomGlobals } from "@/test-utils/dom";
import { MD3_LIGHT_TOKENS, muiTheme } from "@/theme/mui-theme";

let restoreDom: (() => void) | null = null;

beforeEach(() => {
    restoreDom = installDomGlobals("http://localhost/").restore;
});

afterEach(() => {
    cleanup();
    restoreDom?.();
    restoreDom = null;
});

test("muiTheme enforces Google MD3 light palette, disableRipple, and synchronous overlay transitions", () => {
    expect(muiTheme.palette.mode).toBe("light");
    expect(muiTheme.palette.primary.main).toBe(MD3_LIGHT_TOKENS.primary);
    expect(muiTheme.palette.background.default).toBe("#f8fafd");
    expect(muiTheme.palette.text.primary).toBe("#1f1f1f");
    expect(muiTheme.palette.text.secondary).toBe("#444746");
    expect(muiTheme.components?.MuiButtonBase?.defaultProps?.disableRipple).toBe(true);
    expect(muiTheme.components?.MuiDialog?.defaultProps?.transitionDuration).toBe(0);
    expect(muiTheme.components?.MuiPopover?.defaultProps?.transitionDuration).toBe(0);
    expect(muiTheme.components?.MuiMenu?.defaultProps?.transitionDuration).toBe(0);
    expect(muiTheme.components?.MuiModal?.defaultProps?.closeAfterTransition).toBe(false);
});

test("MaterialThemeProvider nests idempotently and renders MUI MD3 shared primitives cleanly", () => {
    const view = render(
        <MaterialThemeProvider>
            <MaterialThemeProvider>
                <MemoryRouter>
                    <WorkspaceShell
                        sidebarTitle="教师工作台"
                        sidebarIcon={BarChart3}
                        menuItems={[{ path: "/", label: "教学概览", icon: BarChart3 }]}
                        sidebarFooter={<div>张岚</div>}
                        pageTitle="教学概览"
                        pageSubtitle="商务统计虚拟仿真系统"
                        headerActions={<IconButton aria-label="刷新概览"><BarChart3 /></IconButton>}
                    >
                        <KpiStatCard label="进行中任务" value={12} icon={BarChart3} intent="primary" testId="kpi-active" />
                        <StatusBadge intent="success">已发布</StatusBadge>
                        <Button asChild><a href="#main-content">跳转链接</a></Button>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>课题名称</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell>现制茶饮定价调研</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </WorkspaceShell>
                </MemoryRouter>
            </MaterialThemeProvider>
        </MaterialThemeProvider>,
    );

    expect(view.container.querySelector(".MuiDrawer-root")).not.toBeNull();
    expect(view.container.querySelector(".MuiAppBar-root")).not.toBeNull();
    expect(view.container.querySelector(".MuiChip-root")).not.toBeNull();
    expect(view.getByRole("columnheader", { name: "课题名称" }).getAttribute("scope")).toBe("col");
    expect(view.getByTestId("kpi-active").textContent).toBe("12");
    expect(view.getByRole("link", { name: "跳转链接" }).className).toContain("rounded-pill");
});

test("AuthLoginScreen renders centered Google Workspace Paper card without legacy institutional-grid", () => {
    const view = render(
        <AuthLoginScreen
            portal="student"
            heading="学生登录"
            description="使用学号和密码登录"
            accountLabel="学号"
            accountPlaceholder="请输入学号"
            resetHint="忘记密码？请联系班级教师重置"
            username=""
            password=""
            loading={false}
            error={null}
            alternateLinks={[{ href: "/teacher/login", label: "教师登录" }]}
            onUsernameChange={() => undefined}
            onPasswordChange={() => undefined}
            onSubmit={(e) => e.preventDefault()}
        />,
    );

    expect(view.container.querySelector(".institutional-grid")).toBeNull();
    expect(view.container.querySelector(".MuiPaper-root")).not.toBeNull();
    expect(view.getByRole("heading", { name: "学生登录" })).not.toBeNull();
});
