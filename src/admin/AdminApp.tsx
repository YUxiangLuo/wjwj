import { useState, useEffect } from "react";
import {
    LayoutDashboard, Calendar, Users, GraduationCap, School, UserCheck,
    Activity, Megaphone, Settings, Bell, LogOut, Loader2, Search,
    Menu, X, Sun, Moon
} from "lucide-react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
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
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
                <div className="min-h-screen flex items-center justify-center bg-slate-950">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            );
        }
        if (authState === "authed") return <Navigate to="/" replace />;
        return <Login />;
    }

    if (authState === "checking") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    if (isRecoveringLogin) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
        );
    }

    if (authState !== "authed") return <Navigate to="/login" replace />;

    return (
        <div className="flex min-h-screen bg-slate-950 text-slate-200 font-sans antialiased">
            <Toaster richColors position="top-right" theme={theme} />

            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto lg:flex lg:flex-col ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                <div className="h-16 px-6 border-b border-slate-800 flex items-center justify-between lg:justify-start">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                            <LayoutDashboard className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-100 tracking-tight">抽样统计系统</h1>
                            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Admin Portal</p>
                        </div>
                    </div>
                    <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-slate-100">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
                    <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Main Menu</div>
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path);
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                data-testid={`admin-nav-${item.path === "/" ? "dashboard" : item.path.slice(1)}`}
                                className={({ isActive: activeLink }) => `
                                    flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all duration-200 group
                                    ${(item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path))
                                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-100"
                                    }
                                `}
                            >
                                <Icon className={`w-4 h-4 transition-colors ${(item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path))
                                        ? "text-white"
                                        : "text-slate-500 group-hover:text-slate-300"
                                    }`} />
                                <span className="font-medium">{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9 border border-slate-700 ring-2 ring-slate-900">
                            <AvatarFallback className="bg-slate-800 text-indigo-500 text-sm font-medium">
                                {adminUser?.username?.charAt(0)?.toUpperCase() ?? "A"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-200 truncate">{adminUser?.username ?? "管理员"}</div>
                            <div className="text-xs text-slate-500 truncate">Administrator</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Overlay for mobile sidebar */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-950">
                <header className="h-16 px-6 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-slate-100 rounded-md hover:bg-slate-800"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-100">{pageTitle}</h2>
                            <p className="hidden md:block text-xs text-slate-500">
                                {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 flex-1 justify-end">
                        <div className="hidden md:flex items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-1.5 w-64 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500/50 transition-all">
                            <Search className="w-4 h-4 text-slate-500" />
                            <input
                                className="bg-transparent text-sm text-slate-200 placeholder:text-slate-500 outline-none w-full"
                                placeholder="搜索功能或数据..."
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                data-testid="admin-notifications-trigger"
                                variant="ghost"
                                size="icon"
                                className="relative text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                                onClick={() => { void openNotifications(); }}
                                aria-label="打开通知中心"
                            >
                                <Bell className="w-5 h-5" />
                                {unreadCount > 0 && (
                                    <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 ring-2 ring-slate-900 rounded-full animate-pulse"></span>
                                )}
                            </Button>

                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                                onClick={toggleTheme}
                                title={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
                                aria-label={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
                            >
                                {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                            </Button>

                            <Separator orientation="vertical" className="h-6 bg-slate-800" />

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button data-testid="admin-logout-trigger" variant="ghost" size="icon" className="text-slate-400 hover:text-rose-600 hover:bg-rose-500/10" title="退出登录">
                                        <LogOut className="w-5 h-5" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                                    <AlertDialogHeader>
                                        <AlertDialogTitle className="text-slate-100">确认退出登录?</AlertDialogTitle>
                                        <AlertDialogDescription className="text-slate-400">
                                            您确定要退出当前账号吗？未保存的内容可能会丢失。
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100">取消</AlertDialogCancel>
                                        <AlertDialogAction onClick={handleLogout} className="bg-rose-600 hover:bg-rose-700 text-white border-none">退出</AlertDialogAction>
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
            </main>

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
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">会话即将过期</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            您的会话将在 5 分钟内过期，是否继续保持登录状态？
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={handleLogout} className="border-slate-700 hover:bg-slate-800 text-slate-300">退出登录</Button>
                        <Button onClick={handleExtendSession} className="bg-indigo-600 hover:bg-indigo-700">继续</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showSessionExpired} onOpenChange={setShowSessionExpired}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">会话已过期</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            您的会话已过期，请重新登录。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => navigate("/login", { replace: true })} className="bg-indigo-600 hover:bg-indigo-700">重新登录</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">通知</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            查看系统通知与操作提醒
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-between items-center my-2">
                        <span className="text-sm text-slate-400">未读 {unreadCount} 条</span>
                        <Button
                            data-testid="admin-notifications-mark-all-read"
                            variant="ghost"
                            size="sm"
                            onClick={() => { void handleMarkAllRead(); }}
                            disabled={unreadCount === 0}
                            className="text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10"
                        >
                            全部已读
                        </Button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto space-y-2 -mx-2 px-2 custom-scrollbar">
                        {notificationsLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                            </div>
                        ) : notifications.length > 0 ? (
                            notifications.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    data-testid={`admin-notification-item-${item.id}`}
                                    onClick={() => item.isRead ? null : void handleMarkNotificationRead(item.id)}
                                    className={`w-full text-left p-4 rounded-lg border transition-all duration-200 hover:border-slate-700 ${item.isRead ? "bg-slate-950/50 border-transparent opacity-70" : "bg-slate-800/50 border-slate-700/50 shadow-sm"
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            {!item.isRead && <span className="flex-shrink-0 w-2 h-2 rounded-full bg-indigo-500 ring-2 ring-indigo-500/20" />}
                                            <span className={`text-sm font-medium ${item.isRead ? "text-slate-400" : "text-slate-200"}`}>{item.title}</span>
                                        </div>
                                        <span className="text-xs text-slate-500 font-mono">
                                            {new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="text-sm text-slate-400 line-clamp-2 pl-4 border-l-2 border-slate-800">{item.content}</div>
                                </button>
                            ))
                        ) : (
                            <div className="text-center py-12 text-slate-500 bg-slate-950/30 rounded-lg border border-dashed border-slate-800">
                                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                                暂无通知
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default AdminApp;
