import { useState, useEffect } from "react";
import {
    LayoutDashboard, Calendar, Users, GraduationCap, School, UserCheck,
    Activity, Megaphone, Settings, Bell, LogOut, Loader2, Search
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

    useEffect(() => {
        if (isLoginPage || authState !== "authed") return;

        // Initial fetch
        fetchNotifications();

        // Poll every minute
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [isLoginPage, authState]);

    useEffect(() => {
        let cancelled = false;
        if (authState !== "checking") return;

        authApi
            .me()
            .then((res) => {
                if (cancelled) return;
                if (res.success) {
                    setAuthState("authed");
                    setAdminUser(res.data ?? null);
                    setSessionExpiresAt(res.data?.sessionExpiresAt ?? null);
                    if (res.data?.isFirstLogin) {
                        setShowPasswordModal(true);
                    }
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

        return () => {
            cancelled = true;
        };
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
                if (res.data.sessionExpiresAt) {
                    setSessionExpiresAt(res.data.sessionExpiresAt);
                }
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

            if (remainingMs <= 5 * 60 * 1000) {
                setShowSessionWarning(true);
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [authState, sessionExpiresAt, navigate]);

    useEffect(() => {
        const handleSessionExpired = () => {
            if (isLoginPage || authState !== "authed") {
                return;
            }
            setShowSessionWarning(false);
            setShowNotifications(false);
            setAuthState("guest");
            setAdminUser(null);
            setSessionExpiresAt(null);
            setShowSessionExpired(true);
        };

        window.addEventListener("admin:session-expired", handleSessionExpired as EventListener);
        return () => {
            window.removeEventListener("admin:session-expired", handleSessionExpired as EventListener);
        };
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
            if (res.success && res.data?.sessionExpiresAt) {
                setSessionExpiresAt(res.data.sessionExpiresAt);
            }
            setShowSessionWarning(false);
        } catch (err) {
            console.error(err);
        }
    };

    const handleChangePassword = async () => {
        setPasswordError(null);
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setPasswordError("请填写完整信息");
            return;
        }
        if (passwordForm.newPassword.length < 12) {
            setPasswordError("新密码长度至少为12位");
            return;
        }
        if (!/[A-Za-z]/.test(passwordForm.newPassword) || !/\d/.test(passwordForm.newPassword) || !/[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+~`]/.test(passwordForm.newPassword)) {
            setPasswordError("新密码需包含字母、数字和特殊字符");
            return;
        }
        if (adminUser?.username && passwordForm.newPassword.includes(adminUser.username)) {
            setPasswordError("新密码不能包含用户名");
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
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
                <div className="min-h-screen flex items-center justify-center bg-slate-50">
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
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (authState !== "authed") {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="flex min-h-screen bg-slate-50">
            <Toaster richColors position="top-right" />
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
                <div className="h-20 px-6 border-b border-slate-200 flex items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <LayoutDashboard className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-base font-semibold text-slate-900">抽样统计系统</h1>
                            <p className="text-xs text-slate-500">管理后台</p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path);
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors
                                    ${isActive
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-slate-600 hover:bg-slate-100"
                                    }`}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? "text-primary-foreground" : "text-slate-500"}`} />
                                <span className="font-medium">{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>

                <Separator className="bg-slate-200" />

                <div className="p-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9">
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                {adminUser?.username?.charAt(0)?.toUpperCase() ?? "A"}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                            <div className="text-sm font-medium text-slate-900">{adminUser?.username ?? "管理员"}</div>
                            <div className="text-xs text-slate-500">Administrator</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white px-8 h-20 border-b border-slate-200 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-semibold text-slate-900">{pageTitle}</h2>
                        <span className="text-sm text-slate-500">
                            {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 flex-1 justify-end">
                        <div className="hidden md:flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 w-72">
                            <Search className="w-4 h-4 text-slate-500" />
                            <input
                                className="bg-transparent text-sm text-slate-700 placeholder:text-slate-400 outline-none w-full"
                                placeholder="搜索功能或数据"
                            />
                        </div>
                        <Button variant="ghost" size="icon" className="relative" onClick={() => {
                            setShowNotifications(true);
                            if (!notifications.length) {
                                fetchNotifications();
                            }
                        }}>
                            <Bell className="w-5 h-5 text-slate-600" />
                            {unreadCount > 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
                            )}
                        </Button>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" title="退出登录">
                                    <LogOut className="w-5 h-5 text-slate-600" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>确认退出登录?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        您确定要退出当前账号吗？
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>取消</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleLogout}>退出</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </header>
                <div className="flex-1 p-8 overflow-y-auto">
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
            </main>

            <Dialog open={showPasswordModal} onOpenChange={() => { }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>首次登录请修改密码</DialogTitle>
                        <DialogDescription>
                            为保证账号安全，请先修改管理员密码。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword">当前密码</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                value={passwordForm.currentPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                autoComplete="current-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">新密码</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                value={passwordForm.newPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">确认新密码</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={passwordForm.confirmPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>
                        {passwordError && <div className="text-sm text-destructive">{passwordError}</div>}
                    </div>
                    <DialogFooter>
                        <Button onClick={handleChangePassword} disabled={passwordSaving}>
                            {passwordSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            保存新密码
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                    <DialogHeader>
                        <DialogTitle>通知</DialogTitle>
                        <DialogDescription>
                            查看系统通知与操作提醒
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-muted-foreground">未读 {unreadCount} 条</span>
                        <Button variant="ghost" size="sm" onClick={handleMarkAllRead} disabled={unreadCount === 0}>
                            全部已读
                        </Button>
                    </div>
                    <div className="max-h-80 overflow-y-auto space-y-2">
                        {notificationsLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            </div>
                        ) : notifications.length > 0 ? (
                            notifications.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => item.isRead ? null : handleMarkNotificationRead(item.id)}
                                    className={`w-full text-left p-3 rounded-lg border transition-colors ${item.isRead ? "bg-background" : "bg-muted/60"}`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {!item.isRead && <span className="w-2 h-2 rounded-full bg-red-500" />}
                                            <span className="text-sm font-medium text-foreground">{item.title}</span>
                                        </div>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(item.createdAt).toLocaleString("zh-CN")}
                                        </span>
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.content}</div>
                                </button>
                            ))
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">暂无通知</div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default AdminApp;
