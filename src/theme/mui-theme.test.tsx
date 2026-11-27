import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { BarChart3 } from "lucide-react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";

import { AuthLoginScreen } from "@/components/AuthLoginScreen";
import { KpiStatCard } from "@/components/KpiStatCard";
import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import { StatusBadge } from "@/components/StatusBadge";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { Button, IconButton } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

test("muiTheme enforces Google MD3 light palette, disableRipple, opacity:1 tabs, and synchronous overlay transitions", () => {
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
    expect((muiTheme.components?.MuiTab?.styleOverrides?.root as Record<string, unknown>)?.opacity).toBe(1);
    expect((muiTheme.components?.MuiTab?.styleOverrides?.root as Record<string, unknown>)?.flexDirection).toBe("row");
    expect((muiTheme.components?.MuiDrawer?.styleOverrides?.paper as Record<string, unknown>)?.zIndex).toBe(20);
});

test("MaterialThemeProvider nests idempotently and keeps WorkspaceSidebar paper z-20 below SkipLink z-[100]", () => {
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

    const drawerPaper = view.container.querySelector(".MuiDrawer-paper");
    expect(drawerPaper).not.toBeNull();
    expect(drawerPaper?.className).toContain("z-20");
    expect(view.getByRole("link", { name: "跳到主要内容" }).className).toContain("z-[100]");
    expect(view.container.querySelector(".MuiAppBar-root")?.className).toContain("z-30");
    expect(view.container.querySelector(".MuiChip-root")).not.toBeNull();
    expect(view.getByRole("columnheader", { name: "课题名称" }).getAttribute("scope")).toBe("col");
    expect(view.getByTestId("kpi-active").textContent).toBe("12");
    expect(view.getByRole("link", { name: "跳转链接" }).className).toContain("rounded-pill");
});

test("TabsList applies layout/surface className once on tablist, unclips scroller focus rings, and keeps TabsTrigger horizontal & full-opacity", () => {
    const view = render(
        <Tabs defaultValue="a">
            <TabsList
                aria-label="三栏测试"
                className="grid h-auto w-full grid-cols-3 gap-1 rounded-surface border border-border bg-card p-1.5"
            >
                <TabsTrigger value="a"><BarChart3 className="size-4" />概览</TabsTrigger>
                <TabsTrigger value="b">诊断</TabsTrigger>
                <TabsTrigger value="c" disabled>禁用项</TabsTrigger>
            </TabsList>
            <TabsContent value="a">A</TabsContent>
        </Tabs>,
    );

    const tabsRoot = view.container.querySelector(".MuiTabs-root") as HTMLElement;
    const scroller = view.container.querySelector(".MuiTabs-scroller") as HTMLElement;
    const tablist = view.getByRole("tablist", { name: "三栏测试" });
    const firstTab = view.getByRole("tab", { name: "概览" });
    const disabledTab = view.getByRole("tab", { name: "禁用项" });

    expect(tabsRoot.className).toContain("contents");
    expect(tabsRoot.className).not.toContain("grid-cols-3");
    expect(tabsRoot.className).not.toContain("p-1.5");
    expect(scroller.className).toContain("contents");
    expect(scroller.style.overflow).toBe("visible");
    expect(tablist.className).toContain("grid-cols-3");
    expect(tablist.className).toContain("p-1.5");
    expect(firstTab.className).toContain("flex-row");
    expect(firstTab.className).toContain("opacity-100");
    expect(firstTab.className).toContain("max-w-none");
    expect(firstTab.className).toContain("overflow-visible");
    expect(disabledTab.className).toContain("[&.Mui-disabled]:opacity-100");
});

test("Switch constrains internal input width without overflowing its track and Select/Popover refs stay stable across rerenders", () => {
    const selectRefCalls: Array<HTMLButtonElement | null> = [];
    const popoverRefCalls: Array<HTMLButtonElement | null> = [];
    const trackSelectRef = mock((node: HTMLButtonElement | null) => {
        selectRefCalls.push(node);
    });
    const trackPopoverRef = mock((node: HTMLButtonElement | null) => {
        popoverRefCalls.push(node);
    });

    function Harness({ step }: { step: number }) {
        const [checked, setChecked] = useState(true);
        return (
            <div>
                <Switch aria-label="启用加权" checked={checked} onCheckedChange={setChecked} />
                <Select value={step === 0 ? "a" : "b"} onValueChange={() => undefined}>
                    <SelectTrigger ref={trackSelectRef} aria-label="选择项">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="a">选项A</SelectItem>
                        <SelectItem value="b">选项B</SelectItem>
                    </SelectContent>
                </Select>
                <Popover open={false} onOpenChange={() => undefined}>
                    <PopoverTrigger ref={trackPopoverRef}>弹出项 {step}</PopoverTrigger>
                    <PopoverContent>内容</PopoverContent>
                </Popover>
            </div>
        );
    }

    const view = render(<Harness step={0} />);
    const switchRoot = view.container.querySelector('[data-slot="switch"]') as HTMLElement;
    expect(switchRoot.className).toContain("overflow-hidden");
    expect(switchRoot.className).toContain("[&_.MuiSwitch-switchBase_.MuiSwitch-input]:left-0");
    expect(switchRoot.className).toContain("[&_.MuiSwitch-switchBase_.MuiSwitch-input]:w-full");

    expect(selectRefCalls.length).toBe(1);
    expect(popoverRefCalls.length).toBe(1);

    // Rerendering with new value/children must NOT detach (null) and reattach stable callback refs.
    view.rerender(<Harness step={1} />);
    expect(selectRefCalls.includes(null)).toBe(false);
    expect(popoverRefCalls.includes(null)).toBe(false);
    expect(selectRefCalls.length).toBe(1);
    expect(popoverRefCalls.length).toBe(1);
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

test("Button enforces Google MD3 four-tier emphasis hierarchy (Filled, Filled Tonal, Outlined, Text)", () => {
    const view = render(
        <MaterialThemeProvider>
            <div>
                <Button variant="default">主操作</Button>
                <Button variant="secondary">次主操作</Button>
                <Button variant="outline">描边次级</Button>
                <Button variant="ghost">文本低强调</Button>
                <Button variant="ghost" className="text-primary hover:text-primary">主色文本</Button>
            </div>
        </MaterialThemeProvider>,
    );

    const filled = view.getByRole("button", { name: "主操作" });
    const tonal = view.getByRole("button", { name: "次主操作" });
    const outlined = view.getByRole("button", { name: "描边次级" });
    const textBtn = view.getByRole("button", { name: "文本低强调" });
    const primaryTextBtn = view.getByRole("button", { name: "主色文本" });

    expect(filled.className).toContain("bg-primary");
    expect(filled.className).toContain("text-primary-foreground");

    expect(tonal.className).toContain("bg-accent");
    expect(tonal.className).toContain("text-accent-foreground");
    expect(tonal.className).toContain("hover:bg-primary-border");

    expect(outlined.className).toContain("border-border");
    expect(outlined.className).toContain("bg-card");
    expect(outlined.className).toContain("text-primary");
    expect(outlined.className).not.toContain("border-input");

    expect(textBtn.className).toContain("bg-transparent");
    expect(textBtn.className).toContain("text-muted-foreground");
    expect(textBtn.className).toContain("hover:bg-muted");

    expect(primaryTextBtn.classList.contains("text-primary")).toBe(true);
    expect(primaryTextBtn.classList.contains("text-muted-foreground")).toBe(false);
});
