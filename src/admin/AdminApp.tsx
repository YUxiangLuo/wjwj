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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ADMIN_PASSWORD_POLICY, evaluatePasswordRules } from "@/lib/password-policy";
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
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<AdminNotification[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [authState, setAuthState] = useState<"checking" | "authed" | "guest">("checking");
    const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
    const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
    const [showSessionWarning, setShowSessionWarning] = useState(false);
    const [showSessionExpired, setShowSessionExpired] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    useEffect(() => {
        if (isLoginPage || authState !== "authed") return;
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [isLoginPage, authState]);

    useEffect(() => {
        let cancelled = false;
        if (authState !== "checking") return;

        authApi.me()
            .then((res) => {
                if (cancelled) return;
                if (res.success) {
                    setAuthState("authed");
                    setAdminUser(res.data ?? null);
                    setSessionExpiresAt(res.data?.sessionExpiresAt ?? null);
                    if (res.data?.isFirstLogin) setShowPasswordModal(true);
                } else {
                    setAuthState("guest");
                    setAdminUser(null);
                    setSessionExpiresAt(null);
                }
            })
            .catch(() => {
                if (cancelled) return;
                setAuthState("guest");
                setAdminUser(null);
                setSessionExpiresAt(null);
            });

        return () => { cancelled = true; };
    }, [authState]);

    useEffect(() => {
        if (isLoginPage || authState !== "guest") return;
        const justLoggedIn = sessionStorage.getItem("admin_login_success") === "1";
        if (justLoggedIn) {
            sessionStorage.removeItem("admin_login_success");
            setAuthState("checking");
        }
    }, [isLoginPage, authState]);

    const fetchNotifications = async () => {
        setNotificationsLoading(true);
        try {
            const res = await systemApi.getNotifications();
            if (res.success && res.data) {
                setUnreadCount(res.data.count);
                setNotifications(res.data.items ?? []);
                if (res.data.sessionExpiresAt) setSessionExpiresAt(res.data.sessionExpiresAt);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setNotificationsLoading(false);
        }
    };

    const handleMarkNotificationRead = async (id: number) => {
        try {
            const res = await systemApi.markNotificationRead(id);
            if (res.success) {
                setNotifications(prev => prev.map(item => item.id === id ? { ...item, isRead: 1 } : item));
                setUnreadCount(prev => Math.max(prev - 1, 0));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            const res = await systemApi.markAllNotificationsRead();
            if (res.success) {
                setNotifications(prev => prev.map(item => ({ ...item, isRead: 1 })));
                setUnreadCount(0);
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        if (authState !== "authed" || !sessionExpiresAt) return;
        const interval = setInterval(() => {
            const remainingMs = new Date(sessionExpiresAt).getTime() - Date.now();
            if (remainingMs <= 0) {
                setShowSessionWarning(false);
                setAuthState("guest");
                setAdminUser(null);
                setSessionExpiresAt(null);
                navigate("/login", { replace: true });
                return;
            }
            if (remainingMs <= 5 * 60 * 1000) setShowSessionWarning(true);
        }, 30000);
        return () => clearInterval(interval);
    }, [authState, sessionExpiresAt, navigate]);

    useEffect(() => {
        const handleSessionExpired = () => {
            if (isLoginPage || authState !== "authed") return;
            setShowSessionWarning(false);
            setShowNotifications(false);
            setAuthState("guest");
            setAdminUser(null);
            setSessionExpiresAt(null);
            setShowSessionExpired(true);
        };
        window.addEventListener("admin:session-expired", handleSessionExpired as EventListener);
        return () => { window.removeEventListener("admin:session-expired", handleSessionExpired as EventListener); };
    }, [authState, isLoginPage]);

    const handleLogout = async () => {
        try {
            await authApi.logout();
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

    const handleChangePassword = async () => {
        setPasswordError(null);
        const passwordRules = evaluatePasswordRules({
            password: passwordForm.newPassword,
            confirmPassword: passwordForm.confirmPassword,
            minLength: ADMIN_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [adminUser?.username],
        });

        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setPasswordError("请填写完整信息");
            return;
        }
        if (passwordForm.newPassword === passwordForm.currentPassword) {
            setPasswordError("新密码不能与当前密码相同");
            return;
        }
        if (!passwordRules.minLength) {
            setPasswordError(`新密码长度至少为${ADMIN_PASSWORD_POLICY.minLength}位`);
            return;
        }
        if (!passwordRules.hasLetter || !passwordRules.hasNumber || !passwordRules.hasSpecial) {
            setPasswordError("新密码需包含字母、数字和特殊字符");
            return;
        }
        if (!passwordRules.noForbiddenSubstring) {
            setPasswordError("新密码不能包含用户名");
            return;
        }
        if (!passwordRules.matched) {
            setPasswordError("两次输入的新密码不一致");
            return;
        }

        setPasswordSaving(true);
        try {
            const res = await authApi.changePassword({
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword,
            });
            if (res.success) {
                setShowPasswordModal(false);
                setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                setAdminUser(prev => (prev ? { ...prev, isFirstLogin: 0 } : prev));
            } else {
                setPasswordError(res.error?.message ?? "修改失败");
            }
        } catch (err) {
            setPasswordError(err instanceof Error ? err.message : "修改失败");
        } finally {
            setPasswordSaving(false);
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
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
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
                            <AvatarFallback className="bg-slate-800 text-indigo-400 text-sm font-medium">
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
                                onClick={() => {
                                    setShowNotifications(true);
                                    if (!notifications.length) fetchNotifications();
                                }}
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
                                    <Button data-testid="admin-logout-trigger" variant="ghost" size="icon" className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10" title="退出登录">
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

            <Dialog open={showPasswordModal} onOpenChange={() => { }}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">首次登录请修改密码</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            为保证账号安全，请先修改管理员密码。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword" className="text-slate-300">当前密码</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                className="bg-slate-950 border-slate-800 focus:ring-indigo-500/20"
                                value={passwordForm.currentPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                autoComplete="current-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPassword" className="text-slate-300">新密码</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                className="bg-slate-950 border-slate-800 focus:ring-indigo-500/20"
                                value={passwordForm.newPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-slate-300">确认新密码</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                className="bg-slate-950 border-slate-800 focus:ring-indigo-500/20"
                                value={passwordForm.confirmPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>
                        {passwordError && <div className="text-sm text-rose-400 flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-rose-500" />{passwordError}</div>}
                    </div>
                    <DialogFooter>
                        <Button onClick={handleChangePassword} disabled={passwordSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto">
                            {passwordSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            保存新密码
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                        <Button variant="ghost" size="sm" onClick={handleMarkAllRead} disabled={unreadCount === 0} className="text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10">
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
                                    onClick={() => item.isRead ? null : handleMarkNotificationRead(item.id)}
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
