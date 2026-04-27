import { useCallback, useEffect, useRef, useState } from "react";
import {
    LayoutDashboard, School, BookOpen, ClipboardList, PenLine, Users, Download, Bell, LogOut, Loader2, Clock, Sun, Moon, BarChart3,
} from "lucide-react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
    SidebarMenuBadge,
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
import "./teacher.css";
import { authApi, teacherApi, type TeacherNotification, type TeacherUser } from "./api-client";
import { TEACHER_LOGIN_REDIRECT_REASON_KEY, TEACHER_LOGIN_SUCCESS_KEY } from "./auth-keys";
import { useTheme } from "@/components/ThemeProvider";
import { TEACHER_PASSWORD_POLICY } from "@/lib/password-policy";
import { Toaster } from "sonner";
import {
    clearLoginSuccess,
    setLoginRedirectReason,
    useAuthBootstrap,
    useLoginSuccessRecovery,
} from "@/hooks/useAuthRecovery";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { usePollingTask } from "@/hooks/usePollingTask";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { useSessionExpiryEvent, useSessionWarningTimeout } from "@/hooks/useSessionExpiry";
import { createLatestRequestGate } from "@/lib/latest-request-gate";

import { Dashboard } from "./pages/Dashboard";
import { ClassManagement } from "./pages/ClassManagement";
import { StudentManagement } from "./pages/StudentManagement";
import { TopicManagement } from "./pages/TopicManagement";
import { TaskManagement } from "./pages/TaskManagement";
import { GradingManagement } from "./pages/GradingManagement";
import { GradingDetail } from "./pages/GradingDetail";
import { AssistantManagement } from "./pages/AssistantManagement";
import { GradeExport } from "./pages/GradeExport";
import { TaskProgressDetail } from "./pages/TaskProgressDetail";
import { Login } from "./pages/Login";
import { TEACHER_GRADING_QUEUE_UPDATED_EVENT } from "./grading-queue-events";

const teacherMenuItems = [
    { path: "/", label: "首页概览", icon: LayoutDashboard },
    { path: "/class", label: "班级管理", icon: School },
    { path: "/topic", label: "课题管理", icon: BookOpen },
    { path: "/task", label: "任务管理", icon: ClipboardList },
    { path: "/grading", label: "作业批改", icon: PenLine },
    { path: "/assistant", label: "助教管理", icon: Users },
    { path: "/export", label: "成绩导出", icon: Download },
];

const assistantMenuItems = [
    { path: "/", label: "首页概览", icon: LayoutDashboard },
    { path: "/grading", label: "作业批改", icon: PenLine },
];

const pageTitles: Record<string, string> = {
    "/": "首页概览",
    "/class": "班级管理",
    "/topic": "课题管理",
    "/task": "任务管理",
    "/grading": "作业批改",
    "/assistant": "助教管理",
    "/export": "成绩导出",
};

function TeacherSidebarNav({
    currentPath,
    userType,
    pendingGradingCount,
}: {
    currentPath: string;
    userType: TeacherUser["type"] | undefined;
    pendingGradingCount: number;
}) {
    const { setOpenMobile } = useSidebar();
    const items = userType === "assistant" ? assistantMenuItems : teacherMenuItems;

    return (
        <SidebarGroup>
            <SidebarGroupLabel>{userType === "assistant" ? "助教菜单" : "教师菜单"}</SidebarGroupLabel>
            <SidebarGroupContent>
                <SidebarMenu>
                    {items.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path);

                        return (
                            <SidebarMenuItem key={item.path}>
                                <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                                    <NavLink
                                        to={item.path}
                                        data-testid={`teacher-nav-${item.path === "/" ? "dashboard" : item.path.slice(1)}`}
                                        onClick={() => setOpenMobile(false)}
                                    >
                                        <Icon />
                                        <span>{item.label}</span>
                                    </NavLink>
                                </SidebarMenuButton>
                                {item.path === "/grading" && pendingGradingCount > 0 && (
                                    <SidebarMenuBadge>{pendingGradingCount}</SidebarMenuBadge>
                                )}
                            </SidebarMenuItem>
                        );
                    })}
                </SidebarMenu>
            </SidebarGroupContent>
        </SidebarGroup>
    );
}

export function TeacherApp() {
    const location = useLocation();
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const currentPath = location.pathname;
    const isLoginPage = currentPath === "/login" || currentPath.endsWith("/login");

    // Get base path for title (e.g., /class/1/students -> /class)
    // Handle root path separately to avoid empty string
    const segment = currentPath.split("/")[1];
    const basePath = segment ? "/" + segment : "/";
    const pageTitle = pageTitles[basePath] ?? "教师端";

    const [authState, setAuthState] = useState<"checking" | "authed" | "guest">("checking");
    const [teacherUser, setTeacherUser] = useState<TeacherUser | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [pendingGradingCount, setPendingGradingCount] = useState(0);
    const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
    const pendingCountGateRef = useRef(createLatestRequestGate());

    const refreshPendingGradingCount = useCallback(async () => {
        if (authState !== "authed" || !teacherUser) {
            pendingCountGateRef.current.invalidate();
            setPendingGradingCount(0);
            return;
        }

        const requestId = pendingCountGateRef.current.start();
        const applyPendingCount = (count: number) => {
            if (!pendingCountGateRef.current.isCurrent(requestId)) return;
            setPendingGradingCount(count);
        };

        try {
            if (teacherUser.type === "assistant") {
                const res = await teacherApi.getGradingList({ status: "pending", pageSize: 1 });
                applyPendingCount(res.success && res.data ? res.data.total : 0);
                return;
            }

            const res = await teacherApi.getStats();
            const pending = res.success && res.data?.stats
                ? (res.data.stats.find((item) => item.label === "待批改作业")?.value ?? 0)
                : 0;
            applyPendingCount(pending);
        } catch {
            applyPendingCount(0);
        }
    }, [authState, teacherUser]);

    useEffect(() => {
        if (authState === "authed" && teacherUser) return;
        pendingCountGateRef.current.invalidate();
        setPendingGradingCount(0);
    }, [authState, teacherUser]);

    useEffect(() => {
        return () => {
            pendingCountGateRef.current.invalidate();
        };
    }, []);

    const passwordChange = usePasswordChange({
        policy: TEACHER_PASSWORD_POLICY,
        forbiddenSubstrings: [teacherUser?.type === "teacher" ? teacherUser.employeeId : teacherUser?.account],
        onSubmit: authApi.changePassword,
        onSuccess: () => {
            setShowPasswordModal(false);
            setTeacherUser((prev) => (prev ? { ...prev, isFirstLogin: 0 } : prev));
        },
    });

    function redirectToLoginWithReason(message: string) {
        setShowSessionWarning(false);
        setShowNotifications(false);
        setAuthState("guest");
        setTeacherUser(null);
        setSessionExpiresAt(null);
        clearLoginSuccess(TEACHER_LOGIN_SUCCESS_KEY);
        setLoginRedirectReason(TEACHER_LOGIN_REDIRECT_REASON_KEY, message);
        navigate("/login", { replace: true });
    }

    const { showSessionWarning, setShowSessionWarning } = useSessionWarningTimeout({
        enabled: authState === "authed",
        sessionExpiresAt,
        onExpire: redirectToLoginWithReason,
    });

    const {
        items: notifications,
        unreadCount,
        isOpen: showNotifications,
        setIsOpen: setShowNotifications,
        loading: notificationsLoading,
        load: loadNotifications,
        open: openNotifications,
        markAsRead: markNotificationAsRead,
        markAllAsRead,
    } = useNotificationCenter<TeacherNotification, { notifications: TeacherNotification[]; unreadCount: number }>({
        list: teacherApi.getNotifications,
        markOne: teacherApi.readNotification,
        markAll: teacherApi.readAllNotifications,
        normalize: (data) => ({
            items: data.notifications,
            unreadCount: data.unreadCount,
        }),
        getItemId: (item) => item.id,
        isItemRead: (item) => item.isRead === 1,
        markItemRead: (item) => ({ ...item, isRead: 1 }),
    });

    useSessionExpiryEvent({
        enabled: !isLoginPage && authState === "authed",
        eventName: "teacher:session-expired",
        onExpire: redirectToLoginWithReason,
    });

    usePollingTask({
        enabled: authState === "authed",
        task: () => loadNotifications({ includeItems: false }),
        intervalMs: 60_000,
        runOnFocus: true,
    });

    usePollingTask({
        enabled: authState === "authed",
        task: refreshPendingGradingCount,
        intervalMs: 60_000,
        runOnFocus: true,
    });

    useAuthBootstrap({
        enabled: authState === "checking",
        fetchCurrentUser: authApi.me,
        onAuthenticated: (response) => {
            setAuthState("authed");
            setTeacherUser(response.data ?? null);
            setSessionExpiresAt(response.data?.sessionExpiresAt ?? null);
            if (response.data?.isFirstLogin) {
                setShowPasswordModal(true);
            }
        },
        onUnauthenticated: (response) => {
            if (
                response?.error?.code === "AUTH_004"
                || response?.error?.code === "AUTH_005"
                || response?.error?.code === "ACCOUNT_DISABLED"
                || response?.error?.code === "ACCOUNT_NOT_FOUND"
            ) {
                setLoginRedirectReason(TEACHER_LOGIN_REDIRECT_REASON_KEY, response.error.message ?? "会话已过期，请重新登录");
            }
            setAuthState("guest");
            setTeacherUser(null);
            setSessionExpiresAt(null);
        },
    });

    const isRecoveringLogin = useLoginSuccessRecovery({
        enabled: !isLoginPage && authState === "guest",
        loginSuccessKey: TEACHER_LOGIN_SUCCESS_KEY,
        onRecover: () => {
            setAuthState("checking");
        },
    });

    useEffect(() => {
        if (authState !== "authed") return;

        const handleQueueUpdated = () => {
            void refreshPendingGradingCount();
        };

        window.addEventListener(TEACHER_GRADING_QUEUE_UPDATED_EVENT, handleQueueUpdated);
        return () => {
            window.removeEventListener(TEACHER_GRADING_QUEUE_UPDATED_EVENT, handleQueueUpdated);
        };
    }, [authState, refreshPendingGradingCount]);

    const handleLogout = async () => {
        try {
            await authApi.logout();
            clearLoginSuccess(TEACHER_LOGIN_SUCCESS_KEY);
            setAuthState("guest");
            setTeacherUser(null);
            setSessionExpiresAt(null);
        } finally {
            navigate("/login", { replace: true });
        }
    };

    const handleExtendSession = async () => {
        const res = await authApi.me();
        if (res.success && res.data) {
            setSessionExpiresAt(res.data.sessionExpiresAt ?? null);
            setShowSessionWarning(false);
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
        if (authState === "authed") {
            return <Navigate to="/" replace />;
        }
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

    if (authState !== "authed") {
        return <Navigate to="/login" replace />;
    }

    if (teacherUser?.isFirstLogin) {
        const accountLabel = teacherUser.type === "assistant" ? teacherUser.account : teacherUser.employeeId;
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
                <div className="w-full max-w-2xl border border-border bg-card p-8 shadow-sm">
                    <div className="space-y-3 text-center">
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold font-heading bg-primary text-primary-foreground">
                            {teacherUser.type === "assistant" ? "助" : "师"}
                        </div>
                        <h1 className="text-2xl font-semibold font-heading uppercase tracking-wider">首次登录需完成密码更新</h1>
                        <p className="text-sm leading-6 text-muted-foreground">
                            为保护账号安全，修改密码前暂不开放课程、批改、通知和导出操作。
                        </p>
                    </div>

                    <div className="mt-6 border border-border bg-muted p-4 text-sm text-muted-foreground">
                        当前账号：<span className="font-mono text-foreground">{accountLabel ?? teacherUser.name}</span>
                    </div>
                </div>

                <PasswordChangeDialog
                    open={showPasswordModal}
                    onOpenChange={setShowPasswordModal}
                    allowClose={false}
                    title="首次登录请修改密码"
                    description="为保证账号安全，请设置新密码。"
                    form={passwordChange.form}
                    onFieldChange={passwordChange.setField}
                    error={passwordChange.error}
                    saving={passwordChange.saving}
                    onSubmit={passwordChange.submit}
                    submitLabel="保存"
                    submitTestId="teacher-password-submit"
                />

                <Toaster richColors position="top-right" theme={theme} />
            </div>
        );
    }

    return (
        <SidebarProvider className="h-screen bg-background text-foreground overflow-hidden">
            <Toaster richColors position="top-right" theme={theme} />

            <Sidebar collapsible="offcanvas">
                <SidebarHeader className="min-h-16 border-b border-sidebar-border px-4 py-3 sm:px-6">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="bg-primary p-1.5 shrink-0">
                            <BarChart3 className="size-5 text-primary-foreground" />
                        </div>
                        <span className="text-sm font-semibold font-heading uppercase tracking-wider text-sidebar-foreground">
                            统计学虚拟仿真实验平台
                        </span>
                    </div>
                </SidebarHeader>

                <SidebarContent className="py-4">
                    <TeacherSidebarNav
                        currentPath={currentPath}
                        userType={teacherUser?.type}
                        pendingGradingCount={pendingGradingCount}
                    />
                </SidebarContent>

                <SidebarFooter className="border-t border-sidebar-border p-4">
                    <div className="flex items-center gap-3 p-2 border border-sidebar-border bg-sidebar-accent">
                        <Avatar size="sm">
                            <AvatarFallback>
                                {teacherUser?.name?.charAt(0) ?? (teacherUser?.type === "assistant" ? "助" : "师")}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{teacherUser?.name ?? (teacherUser?.type === "assistant" ? "助教" : "教师")}</div>
                            <div className="text-xs text-muted-foreground truncate">
                                {teacherUser?.type === "assistant" ? (
                                    <span>助教 · {teacherUser?.account ?? ""}</span>
                                ) : (
                                    teacherUser?.employeeId ?? ""
                                )}
                            </div>
                        </div>
                    </div>
                </SidebarFooter>
            </Sidebar>

            <SidebarInset className="min-w-0">
                <header className="h-16 border-b border-border bg-background/50 backdrop-blur-xl flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
                    <div className="flex items-center gap-4">
                        <SidebarTrigger className="md:hidden" />
                        <div>
                            <h2 className="text-lg font-semibold font-heading uppercase tracking-wider">{pageTitle}</h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        <Badge variant="muted" className="hidden sm:inline-flex">
                            {new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" })}
                        </Badge>

                        <Separator orientation="vertical" className="hidden h-4 sm:block" />

                        <Button
                            variant="ghost"
                            size="icon"
                            data-testid="teacher-open-notifications"
                            className="relative"
                            onClick={() => { void openNotifications(); }}
                        >
                            <Bell />
                            {unreadCount > 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full ring-2 ring-background"></span>
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

                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                data-testid="teacher-change-password-open"
                                onClick={() => {
                                    passwordChange.clearError();
                                    setShowPasswordModal(true);
                                }}
                            >
                                修改密码
                            </Button>
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        data-testid="teacher-logout"
                                        title="退出登录"
                                    >
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
                                        <AlertDialogAction
                                            variant="destructive"
                                            data-testid="teacher-logout-confirm"
                                            onClick={() => { void handleLogout(); }}
                                        >
                                            退出
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </div>
                </header>

                <div className="flex-1 p-4 lg:p-8 overflow-y-auto scrollbar-thin scrollbar-track-transparent">
                    <div className="max-w-7xl mx-auto space-y-6">
                        <Routes>
                            <Route index element={teacherUser?.type === "assistant" ? <GradingManagement /> : <Dashboard />} />
                            <Route path="login" element={<Login />} />
                            <Route path="class" element={teacherUser?.type === "assistant" ? <Navigate to="/grading" replace /> : <ClassManagement />} />
                            <Route path="class/:classId/students" element={teacherUser?.type === "assistant" ? <Navigate to="/grading" replace /> : <StudentManagement />} />
                            <Route path="topic" element={teacherUser?.type === "assistant" ? <Navigate to="/grading" replace /> : <TopicManagement />} />
                            <Route path="task" element={teacherUser?.type === "assistant" ? <Navigate to="/grading" replace /> : <TaskManagement />} />
                            <Route path="task/:taskId/progress" element={teacherUser?.type === "assistant" ? <Navigate to="/grading" replace /> : <TaskProgressDetail />} />
                            <Route path="grading" element={<GradingManagement />} />
                            <Route path="grading/:submissionId" element={<GradingDetail />} />
                            <Route path="assistant" element={teacherUser?.type === "assistant" ? <Navigate to="/grading" replace /> : <AssistantManagement />} />
                            <Route path="export" element={teacherUser?.type === "assistant" ? <Navigate to="/grading" replace /> : <GradeExport />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </div>
                </div>
            </SidebarInset>

            {/* Password Modal */}
            <PasswordChangeDialog
                open={showPasswordModal}
                onOpenChange={setShowPasswordModal}
                allowClose={!teacherUser?.isFirstLogin}
                title={teacherUser?.isFirstLogin ? "首次登录请修改密码" : "修改密码"}
                description="为保证账号安全，请设置新密码。"
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="保存"
                submitTestId="teacher-password-submit"
            />

            {/* Notifications Modal */}
            <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
                <DialogContent showCloseButton={false} className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            通知
                            <Button
                                variant="ghost"
                                size="sm"
                                data-testid="teacher-notification-read-all"
                                onClick={() => { void markAllAsRead(); }}
                                disabled={unreadCount === 0}
                            >
                                全部已读
                            </Button>
                        </DialogTitle>
                        <DialogDescription>最近通知</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[360px] pr-2">
                        <div className="flex flex-col gap-3 pr-2">
                        {notificationsLoading ? (
                            <div className="flex flex-col gap-3">
                                <Skeleton className="h-24 w-full" />
                                <Skeleton className="h-24 w-full" />
                                <Skeleton className="h-24 w-full" />
                            </div>
                        ) : notifications.length === 0 ? (
                            <Empty className="border border-dashed border-border py-10">
                                <EmptyHeader>
                                    <EmptyMedia variant="icon">
                                        <Bell />
                                    </EmptyMedia>
                                    <EmptyTitle>暂无通知</EmptyTitle>
                                </EmptyHeader>
                            </Empty>
                        ) : (
                            notifications.map((item) => (
                                <div key={item.id} className="border border-border p-4 bg-card hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={`text-sm font-medium ${item.isRead ? "text-muted-foreground" : "text-primary"}`}>
                                            {item.title}
                                            {!item.isRead && <span className="ml-2 w-1.5 h-1.5 inline-block rounded-full bg-primary"></span>}
                                        </div>
                                        <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground leading-relaxed">{item.content}</div>
                                    {!item.isRead && (
                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            className="mt-3"
                                            onClick={async () => {
                                                await markNotificationAsRead(item.id);
                                            }}
                                        >
                                            标记已读
                                        </Button>
                                    )}
                                </div>
                            ))
                        )}
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>

            {/* Session Warning Dialog */}
            <Dialog open={showSessionWarning} onOpenChange={setShowSessionWarning}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-warning/80">
                            <Clock className="w-5 h-5" />
                            会话即将过期
                        </DialogTitle>
                        <DialogDescription>
                            您的登录会话即将过期，请选择继续使用或退出登录。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={handleLogout}>
                            退出登录
                        </Button>
                        <Button variant="default" onClick={handleExtendSession}>
                            继续使用
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </SidebarProvider>
    );
}
