import { useState, useEffect } from "react";
import {
    LayoutDashboard, Calendar, Users, GraduationCap, School, UserCheck,
    Activity, Megaphone, Settings, Bell, LogOut, Loader2,
    Sun, Moon, BarChart3,
} from "lucide-react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar";
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dashboard } from "./pages/Dashboard";
import { authApi, systemApi, type AdminUser, type AdminNotification } from "./api-client";
import { Toaster } from "sonner";
import { useTheme } from "@/components/ThemeProvider";
import { ADMIN_PASSWORD_POLICY } from "@/lib/password-policy";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { clearLoginSuccess, useAuthBootstrap, useLoginSuccessRecovery } from "@/hooks/useAuthRecovery";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { usePollingTask } from "@/hooks/usePollingTask";
import { useSessionExpiryEvent, useSessionWarningTimeout } from "@/hooks/useSessionExpiry";
import { ADMIN_LOGIN_SUCCESS_KEY } from "./auth-keys";
import { SemesterManagement } from "./pages/SemesterManagement";
import { TeacherManagement } from "./pages/TeacherManagement";
import { ClassManagement } from "./pages/ClassManagement";
import { AssistantManagement } from "./pages/AssistantManagement";
import { StudentManagement } from "./pages/StudentManagement";
import { AnnouncementManagement } from "./pages/AnnouncementManagement";
import { SystemMonitor } from "./pages/SystemMonitor";
import { SystemSettings } from "./pages/SystemSettings";
import { Login } from "./pages/Login";

const menuItems = [
    { path: "/", label: "首页概览", icon: LayoutDashboard },
    { path: "/semester", label: "学期管理", icon: Calendar },
    { path: "/teacher", label: "教师管理", icon: Users },
    { path: "/assistant", label: "助教管理", icon: UserCheck },
    { path: "/class", label: "班级管理", icon: School },
    { path: "/student", label: "学生管理", icon: GraduationCap },
    { path: "/monitor", label: "系统监控", icon: Activity },
    { path: "/announcement", label: "公告管理", icon: Megaphone },
    { path: "/settings", label: "系统设置", icon: Settings },
];

const pageTitles: Record<string, string> = {
    "/": "首页概览",
    "/semester": "学期管理",
    "/teacher": "教师管理",
    "/assistant": "助教管理",
    "/class": "班级管理",
    "/student": "学生管理",
    "/monitor": "系统监控",
    "/announcement": "公告管理",
    "/settings": "系统设置",
};

function AdminSidebarNav({ currentPath }: { currentPath: string }) {
    const { setOpenMobile } = useSidebar();

    return (
        <SidebarGroup>
            <SidebarGroupLabel>管理菜单</SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path);

                        return (
                            <SidebarMenuItem key={item.path}>
                                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                                    <NavLink
                                        to={item.path}
                                        data-testid={`admin-nav-${item.path === "/" ? "dashboard" : item.path.slice(1)}`}
                                        onClick={() => setOpenMobile(false)}
                                    >
                                        <Icon />
                                        <span>{item.label}</span>
                                    </NavLink>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        );
                    })}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}

export function AdminApp() {
    const location = useLocation();
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const currentPath = location.pathname;
    const isLoginPage = currentPath === "/login" || currentPath.endsWith("/login");
    const pageTitle = pageTitles[currentPath] ?? "管理后台";
    const [authState, setAuthState] = useState<"checking" | "authed" | "guest">("checking");
    const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
    const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
    const [showSessionExpired, setShowSessionExpired] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);

    const passwordChange = usePasswordChange({
        policy: ADMIN_PASSWORD_POLICY,
        forbiddenSubstrings: [adminUser?.username],
        onSubmit: authApi.changePassword,
        onSuccess: () => {
            setShowPasswordModal(false);
            setAdminUser((prev) => (prev ? { ...prev, isFirstLogin: 0 } : prev));
        },
    });

    const {
        items: notifications,
        unreadCount,
        loading: notificationsLoading,
        isOpen: showNotifications,
        setIsOpen: setShowNotifications,
        load: fetchNotifications,
        open: openNotifications,
        markAsRead: handleMarkNotificationRead,
        markAllAsRead: handleMarkAllRead,
    } = useNotificationCenter<AdminNotification, { count: number; items: AdminNotification[]; sessionExpiresAt?: string | null }>({
        list: systemApi.getNotifications,
        markOne: systemApi.markNotificationRead,
        markAll: systemApi.markAllNotificationsRead,
        normalize: (data) => ({
            items: data.items ?? [],
            unreadCount: data.count ?? 0,
        }),
        getItemId: (item) => item.id,
        isItemRead: (item) => item.isRead === 1,
        markItemRead: (item) => ({ ...item, isRead: 1 }),
        onLoaded: (data) => {
            if (data.sessionExpiresAt) {
                setSessionExpiresAt(data.sessionExpiresAt);
            }
        },
    });

    const handleTimedSessionExpiry = () => {
        setShowSessionWarning(false);
        setAuthState("guest");
        setAdminUser(null);
        setSessionExpiresAt(null);
        navigate("/login", { replace: true });
    };

    const handleRemoteSessionExpiry = () => {
        if (isLoginPage || authState !== "authed") return;
        setShowSessionWarning(false);
        setShowNotifications(false);
        setAuthState("guest");
        setAdminUser(null);
        setSessionExpiresAt(null);
        setShowSessionExpired(true);
    };

    const { showSessionWarning, setShowSessionWarning } = useSessionWarningTimeout({
        enabled: authState === "authed",
        sessionExpiresAt,
        onExpire: handleTimedSessionExpiry,
    });

    useSessionExpiryEvent({
        enabled: !isLoginPage && authState === "authed",
        eventName: "admin:session-expired",
        onExpire: handleRemoteSessionExpiry,
    });

    usePollingTask({
        enabled: !isLoginPage && authState === "authed",
        task: () => fetchNotifications({ includeItems: false }),
        intervalMs: 60_000,
    });

    useAuthBootstrap({
        enabled: authState === "checking",
        fetchCurrentUser: authApi.me,
        onAuthenticated: (response) => {
            setAuthState("authed");
            setAdminUser(response.data ?? null);
            setSessionExpiresAt(response.data?.sessionExpiresAt ?? null);
            if (response.data?.isFirstLogin) setShowPasswordModal(true);
        },
        onUnauthenticated: () => {
            setAuthState("guest");
            setAdminUser(null);
            setSessionExpiresAt(null);
        },
    });

    const isRecoveringLogin = useLoginSuccessRecovery({
        enabled: !isLoginPage && authState === "guest",
        loginSuccessKey: ADMIN_LOGIN_SUCCESS_KEY,
        onRecover: () => {
            setAuthState("checking");
        },
    });

    const handleLogout = async () => {
        try {
            await authApi.logout();
            clearLoginSuccess(ADMIN_LOGIN_SUCCESS_KEY);
            setAuthState("guest");
            setAdminUser(null);
            setSessionExpiresAt(null);
        } finally {
            navigate("/login", { replace: true });
        }
    };

    const handleExtendSession = async () => {
        try {
            const res = await authApi.me();
            if (res.success && res.data?.sessionExpiresAt) setSessionExpiresAt(res.data.sessionExpiresAt);
            setShowSessionWarning(false);
        } catch (err) {
            console.error(err);
        }
    };

    if (isLoginPage) {
        if (authState === "checking") {
            return (
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
            );
        }
        if (authState === "authed") return <Navigate to="/" replace />;
        return <Login />;
    }

    if (authState === "checking") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isRecoveringLogin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (authState !== "authed") return <Navigate to="/login" replace />;

    if (adminUser?.isFirstLogin) {
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
                <div className="w-full max-w-2xl border border-border bg-card p-8 shadow-sm">
                    <div className="space-y-3 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-xl font-bold font-heading text-primary-foreground">
                            A
                        </div>
                        <h1 className="text-2xl font-semibold font-heading uppercase tracking-wider">首次登录需完成密码更新</h1>
                        <p className="text-sm leading-6 text-muted-foreground">
                            修改管理员密码前，系统设置、用户管理和通知功能暂不可访问。
                        </p>
                    </div>

                    <div className="mt-6 border border-border bg-muted p-4 text-sm text-muted-foreground">
                        当前账号：<span className="font-mono text-foreground">{adminUser.username}</span>
                    </div>
                </div>

                <PasswordChangeDialog
                    open={showPasswordModal}
                    onOpenChange={setShowPasswordModal}
                    allowClose={false}
                    title="首次登录请修改密码"
                    description="为保证账号安全，请先修改管理员密码。"
                    form={passwordChange.form}
                    onFieldChange={passwordChange.setField}
                    error={passwordChange.error}
                    saving={passwordChange.saving}
                    onSubmit={passwordChange.submit}
                    submitLabel="保存新密码"
                    submitTestId="admin-first-login-password-submit"
                    fieldTestIds={{
                        currentPassword: "admin-first-login-current-password",
                        newPassword: "admin-first-login-new-password",
                        confirmPassword: "admin-first-login-confirm-password",
                    }}
                />

                <Toaster richColors position="top-right" theme={theme} />
            </div>
        );
    }

    return (
        <SidebarProvider className="min-h-screen bg-background text-foreground font-sans antialiased">
            <Toaster richColors position="top-right" theme={theme} />

            <Sidebar collapsible="offcanvas">
                <SidebarHeader className="min-h-16 border-b border-sidebar-border px-4 py-3 sm:px-6">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="bg-primary p-1.5 shrink-0">
                            <BarChart3 className="size-5 text-primary-foreground" />
                        </div>
                        <span className="text-sm font-semibold font-heading uppercase tracking-wider leading-snug text-sidebar-foreground">
                            统计学虚拟仿真实验平台
                        </span>
                    </div>
                </SidebarHeader>

                <SidebarContent className="py-4">
                    <AdminSidebarNav currentPath={currentPath} />
                </SidebarContent>

                <SidebarFooter className="border-t border-sidebar-border p-4">
                    <div className="flex items-center gap-3 p-2 border border-sidebar-border bg-sidebar-accent">
                        <Avatar className="size-9">
                            <AvatarFallback className="text-sm font-medium">
                                {adminUser?.username?.charAt(0)?.toUpperCase() ?? "A"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{adminUser?.username ?? "管理员"}</div>
                            <div className="text-xs text-muted-foreground truncate">系统管理员</div>
                        </div>
                    </div>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset className="min-w-0 overflow-hidden">
                <header className="h-16 px-6 border-b border-border bg-background/50 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <SidebarTrigger className="-ml-2 md:hidden" />
                        <div>
                            <h2 className="text-lg font-semibold font-heading uppercase tracking-wider">{pageTitle}</h2>
                            <p className="hidden md:block text-xs text-muted-foreground">
                                {new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 flex-1 justify-end">
                        <div className="flex items-center gap-2">
                            <Button
                                data-testid="admin-notifications-trigger"
                                variant="ghost"
                                size="icon"
                                className="relative"
                                onClick={() => { void openNotifications(); }}
                                aria-label="打开通知中心"
                            >
                                <Bell />
                                {unreadCount > 0 && (
                                    <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-destructive ring-2 ring-background rounded-full animate-pulse"></span>
                                )}
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleTheme}
                                title={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
                                aria-label={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
                            >
                                {theme === "light" ? <Moon /> : <Sun />}
                            </Button>

                            <Separator orientation="vertical" className="h-6" />

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button data-testid="admin-logout-trigger" variant="ghost" size="icon" title="退出登录">
                                        <LogOut />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>确认退出登录?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            您确定要退出当前账号吗？未保存的内容可能会丢失。
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>取消</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleLogout} variant="destructive">退出</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </header>

                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-6">
                        <Routes>
                            <Route index element={<Dashboard />} />
                            <Route path="login" element={<Login />} />
                            <Route path="semester" element={<SemesterManagement />} />
                            <Route path="teacher" element={<TeacherManagement />} />
                            <Route path="assistant" element={<AssistantManagement />} />
                            <Route path="class" element={<ClassManagement />} />
                            <Route path="student" element={<StudentManagement />} />
                            <Route path="monitor" element={<SystemMonitor />} />
                            <Route path="announcement" element={<AnnouncementManagement />} />
                            <Route path="settings" element={<SystemSettings />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </div>
                </div>
            </SidebarInset>

            <PasswordChangeDialog
                open={showPasswordModal}
                onOpenChange={setShowPasswordModal}
                allowClose={false}
                title="首次登录请修改密码"
                description="为保证账号安全，请先修改管理员密码。"
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="保存新密码"
                submitTestId="admin-first-login-password-submit"
                fieldTestIds={{
                    currentPassword: "admin-first-login-current-password",
                    newPassword: "admin-first-login-new-password",
                    confirmPassword: "admin-first-login-confirm-password",
                }}
            />

            <Dialog open={showSessionWarning} onOpenChange={setShowSessionWarning}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>会话即将过期</DialogTitle>
                        <DialogDescription>
                            您的会话将在 5 分钟内过期，是否继续保持登录状态？
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={handleLogout}>退出登录</Button>
                        <Button onClick={handleExtendSession}>继续</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showSessionExpired} onOpenChange={setShowSessionExpired}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>会话已过期</DialogTitle>
                        <DialogDescription>
                            您的会话已过期，请重新登录。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => navigate("/login", { replace: true })}>重新登录</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader className="pr-12">
                        <DialogTitle>通知</DialogTitle>
                        <div className="flex items-center justify-between gap-3">
                            <DialogDescription>
                                查看系统通知与操作提醒（未读 {unreadCount} 条）
                            </DialogDescription>
                            <Button
                                data-testid="admin-notifications-mark-all-read"
                                variant="ghost"
                                size="xs"
                                className="shrink-0"
                                onClick={() => { void handleMarkAllRead(); }}
                                disabled={unreadCount === 0}
                            >
                                全部已读
                            </Button>
                        </div>
                    </DialogHeader>
                    <ScrollArea className="-mx-2 h-[60vh] max-h-[420px] px-2">
                        <div className="flex flex-col gap-2 pr-2">
                        {notificationsLoading ? (
                            <div className="flex flex-col gap-2 py-2">
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        ) : notifications.length > 0 ? (
                            notifications.map(item => (
                                <Button
                                    key={item.id}
                                    type="button"
                                    variant="ghost"
                                    data-testid={`admin-notification-item-${item.id}`}
                                    onClick={() => item.isRead ? null : void handleMarkNotificationRead(item.id)}
                                    className={`flex-col items-stretch h-auto w-full justify-start whitespace-normal border p-4 text-left font-normal normal-case tracking-normal transition-all duration-200 ${item.isRead ? "bg-card/50 border-transparent opacity-70" : "bg-muted border-border"
                                        }`}
                                >
                                    <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex min-w-0 items-start gap-2">
                                            {!item.isRead && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-primary ring-2 ring-primary/20" />}
                                            <span className={`min-w-0 break-words text-sm font-medium leading-5 ${item.isRead ? "text-muted-foreground" : "text-foreground"}`}>{item.title}</span>
                                        </div>
                                        <span className="shrink-0 pl-4 text-xs font-mono text-muted-foreground sm:pl-0">
                                            {new Date(item.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="border-l-2 border-border pl-4 text-sm leading-6 text-muted-foreground">{item.content}</div>
                                </Button>
                            ))
                        ) : (
                            <Empty className="border border-dashed border-border bg-card/30 py-12">
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <Bell />
                                    </EmptyMedia>
                                    <EmptyTitle>暂无通知</EmptyTitle>
                                </EmptyHeader>
                            </Empty>
                        )}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        </SidebarProvider>
    );
}

export default AdminApp;
