import { useEffect, useState } from "react";
import {
    LayoutDashboard, School, BookOpen, ClipboardList, PenLine, Users, Download, Bell, LogOut, Loader2, Menu, Clock, Sun, Moon
} from "lucide-react";
import { Routes, Route, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import "./teacher.css";
import { authApi, teacherApi, type TeacherNotification, type TeacherUser } from "./api-client";
import { useTheme } from "@/components/ThemeProvider";
import { TEACHER_PASSWORD_POLICY, evaluatePasswordRules } from "@/lib/password-policy";
import { Toaster } from "sonner";

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

const LOGIN_REDIRECT_REASON_KEY = "teacher_login_redirect_reason";

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

    // Mobile sidebar state
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [authState, setAuthState] = useState<"checking" | "authed" | "guest">("checking");
    const [teacherUser, setTeacherUser] = useState<TeacherUser | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<TeacherNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [pendingGradingCount, setPendingGradingCount] = useState(0);
    const [showSessionWarning, setShowSessionWarning] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);
    const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (authState !== "checking") return;

        authApi
            .me()
            .then((res) => {
                if (cancelled) return;
                if (res.success) {
                    setAuthState("authed");
                    setTeacherUser(res.data ?? null);
                    setSessionExpiresAt(res.data?.sessionExpiresAt ?? null);
                    if (res.data?.isFirstLogin) {
                        setShowPasswordModal(true);
                    }
                } else {
                    if (res.error?.code === "AUTH_004" || res.error?.code === "AUTH_005") {
                        sessionStorage.setItem(LOGIN_REDIRECT_REASON_KEY, res.error.message);
                    }
                    setAuthState("guest");
                    setTeacherUser(null);
                }
            })
            .catch(() => {
                if (cancelled) return;
                setAuthState("guest");
                setTeacherUser(null);
            });

        return () => {
            cancelled = true;
        };
    }, [authState]);

    useEffect(() => {
        if (isLoginPage || authState !== "guest") return;
        const justLoggedIn = sessionStorage.getItem("teacher_login_success") === "1";
        if (justLoggedIn) {
            sessionStorage.removeItem("teacher_login_success");
            setAuthState("checking");
        }
    }, [isLoginPage, authState]);

    useEffect(() => {
        if (authState !== "authed" || !teacherUser) return;
        let cancelled = false;

        if (teacherUser.type === "assistant") {
            teacherApi.getGradingList("pending").then((res) => {
                if (cancelled) return;
                if (res.success && res.data) {
                    setPendingGradingCount(res.data.length);
                }
            }).catch(() => {
                if (cancelled) return;
                setPendingGradingCount(0);
            });
        } else {
            teacherApi.getStats().then((res) => {
                if (cancelled) return;
                if (res.success && res.data?.stats) {
                    const pending = res.data.stats.find((item) => item.label === "待批改作业")?.value ?? 0;
                    setPendingGradingCount(pending);
                }
            }).catch(() => {
                if (cancelled) return;
                setPendingGradingCount(0);
            });
        }

        return () => {
            cancelled = true;
        };
    }, [authState, teacherUser]);

    const handleLogout = async () => {
        try {
            await authApi.logout();
            setAuthState("guest");
            setTeacherUser(null);
        } finally {
            navigate("/login", { replace: true });
        }
    };

    const loadNotifications = async (withList = true) => {
        const res = await teacherApi.getNotifications();
        if (res.success && res.data) {
            if (withList) {
                setNotifications(res.data.notifications);
            }
            setUnreadCount(res.data.unreadCount);
        }
    };

    useEffect(() => {
        if (authState !== "authed") return;
        let cancelled = false;
        const refreshUnread = async () => {
            if (cancelled) return;
            await loadNotifications(false);
        };

        refreshUnread();
        const onFocus = () => {
            refreshUnread();
        };
        window.addEventListener("focus", onFocus);
        const timer = window.setInterval(refreshUnread, 60_000);

        return () => {
            cancelled = true;
            window.removeEventListener("focus", onFocus);
            window.clearInterval(timer);
        };
    }, [authState]);

    // Session timeout monitoring
    useEffect(() => {
        if (authState !== "authed" || !sessionExpiresAt) return;

        const check = () => {
            const remaining = new Date(sessionExpiresAt).getTime() - Date.now();
            if (remaining <= 0) {
                setSessionExpired(true);
                setShowSessionWarning(false);
            } else if (remaining <= 5 * 60 * 1000) {
                setShowSessionWarning(true);
            }
        };

        check();
        const timer = window.setInterval(check, 30_000);
        return () => window.clearInterval(timer);
    }, [authState, sessionExpiresAt]);

    const handleExtendSession = async () => {
        const res = await authApi.me();
        if (res.success && res.data) {
            setSessionExpiresAt(res.data.sessionExpiresAt ?? null);
            setShowSessionWarning(false);
            setSessionExpired(false);
        }
    };

    const handleChangePassword = async () => {
        setPasswordError(null);
        const accountId = teacherUser?.type === "teacher" ? teacherUser.employeeId : teacherUser?.account;
        const passwordRules = evaluatePasswordRules({
            password: passwordForm.newPassword,
            confirmPassword: passwordForm.confirmPassword,
            minLength: TEACHER_PASSWORD_POLICY.minLength,
            forbiddenSubstrings: [accountId],
        });

        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setPasswordError("请填写完整信息");
            return;
        }
        if (!passwordRules.minLength) {
            setPasswordError(`新密码长度至少为${TEACHER_PASSWORD_POLICY.minLength}位`);
            return;
        }
        if (!passwordRules.hasLetter || !passwordRules.hasNumber || !passwordRules.hasSpecial) {
            setPasswordError("新密码需包含字母、数字和特殊字符");
            return;
        }
        if (passwordForm.newPassword === passwordForm.currentPassword) {
            setPasswordError("新密码不能与当前密码相同");
            return;
        }
        if (!passwordRules.noForbiddenSubstring) {
            setPasswordError("新密码不能包含工号/账号");
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
                setTeacherUser(prev => (prev ? { ...prev, isFirstLogin: 0 } : prev));
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
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
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
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (authState !== "authed") {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
            <Toaster richColors position="top-right" theme={theme} />
            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 flex flex-col
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="h-16 px-6 border-b border-slate-800 flex items-center shrink-0">
                    <div className="flex items-center gap-2 font-semibold text-lg text-slate-100">
                        <div className="bg-indigo-600 p-1.5 rounded-lg">
                            <LayoutDashboard className="w-4 h-4 text-white" />
                        </div>
                        抽样统计系统
                    </div>
                </div>

                <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
                    <div className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        {teacherUser?.type === "assistant" ? "助教菜单" : "教师菜单"}
                    </div>
                    {(teacherUser?.type === "assistant" ? assistantMenuItems : teacherMenuItems).map((item) => {
                        const Icon = item.icon;
                        const isActive = item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path);

                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                data-testid={`teacher-nav-${item.path === "/" ? "dashboard" : item.path.slice(1)}`}
                                onClick={() => setIsSidebarOpen(false)}
                                className={`flex items-center justify-between px-3 py-2.5 text-sm rounded-lg transition-all duration-200 group
                                    ${isActive
                                        ? "bg-indigo-500/10 text-indigo-500"
                                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon className={`w-4 h-4 transition-colors ${isActive ? "text-indigo-500" : "text-slate-500 group-hover:text-slate-300"}`} />
                                    <span className="font-medium">{item.label}</span>
                                </div>
                                {item.path === "/grading" && pendingGradingCount > 0 && (
                                    <Badge className="bg-rose-500/20 text-rose-600 border-none hover:bg-rose-500/30">
                                        {pendingGradingCount}
                                    </Badge>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 border border-slate-800">
                        <Avatar className="w-9 h-9 border border-slate-700">
                            <AvatarFallback className={`text-xs font-semibold ${teacherUser?.type === "assistant" ? "bg-purple-950 text-purple-600" : "bg-indigo-950 text-indigo-500"}`}>
                                {teacherUser?.name?.charAt(0) ?? (teacherUser?.type === "assistant" ? "助" : "师")}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-200 truncate">{teacherUser?.name ?? (teacherUser?.type === "assistant" ? "助教" : "教师")}</div>
                            <div className="text-xs text-slate-500 truncate">
                                {teacherUser?.type === "assistant" ? (
                                    <span className="text-purple-600">助教 · {teacherUser?.account ?? ""}</span>
                                ) : (
                                    teacherUser?.employeeId ?? ""
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Mobile Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 bg-slate-950 relative z-0">
                <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="lg:hidden text-slate-400 hover:text-slate-100"
                            onClick={() => setIsSidebarOpen(true)}
                        >
                            <Menu className="w-5 h-5" />
                        </Button>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-100">{pageTitle}</h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4">
                        <span className="hidden sm:block text-xs text-slate-500 font-mono bg-slate-900 px-2 py-1 rounded border border-slate-800">
                            {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}
                        </span>

                        <div className="h-4 w-px bg-slate-800 hidden sm:block"></div>

                        <Button
                            variant="ghost"
                            size="icon"
                            data-testid="teacher-open-notifications"
                            className="relative text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10"
                            onClick={async () => {
                                await loadNotifications();
                                setShowNotifications(true);
                            }}
                        >
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-slate-900"></span>
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

                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                data-testid="teacher-change-password-open"
                                onClick={() => setShowPasswordModal(true)}
                                className="text-slate-400 hover:text-slate-200"
                            >
                                修改密码
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                data-testid="teacher-logout"
                                onClick={handleLogout}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-500/10"
                                title="退出登录"
                            >
                                <LogOut className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>
                </header>

                <div className="flex-1 p-4 lg:p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
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
            </main>

            {/* Password Modal */}
            <Dialog open={showPasswordModal} onOpenChange={(open) => {
                if (teacherUser?.isFirstLogin) return;
                setShowPasswordModal(open);
            }}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">{teacherUser?.isFirstLogin ? "首次登录请修改密码" : "修改密码"}</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            为保证账号安全，请设置新密码。
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
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500"
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
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500"
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
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500"
                            />
                        </div>
                        {passwordError && <div className="text-sm text-rose-500 bg-rose-500/10 p-2 rounded">{passwordError}</div>}
                    </div>
                    <DialogFooter>
                        {!teacherUser?.isFirstLogin && (
                            <Button variant="ghost" onClick={() => setShowPasswordModal(false)} disabled={passwordSaving} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">
                                取消
                            </Button>
                        )}
                        <Button data-testid="teacher-password-submit" onClick={handleChangePassword} disabled={passwordSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {passwordSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Notifications Modal */}
            <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
                <DialogContent className="sm:max-w-lg bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">通知</DialogTitle>
                        <DialogDescription className="text-slate-400">最近通知</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                        {notifications.length === 0 ? (
                            <div className="text-sm text-slate-500 text-center py-8">暂无通知</div>
                        ) : (
                            notifications.map((item) => (
                                <div key={item.id} className="border border-slate-800 rounded-lg p-4 bg-slate-950 hover:bg-slate-800/30 transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={`text-sm font-medium ${item.isRead ? "text-slate-400" : "text-indigo-500"}`}>
                                            {item.title}
                                            {!item.isRead && <span className="ml-2 w-1.5 h-1.5 inline-block rounded-full bg-indigo-500"></span>}
                                        </div>
                                        <span className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</span>
                                    </div>
                                    <div className="text-sm text-slate-400 leading-relaxed">{item.content}</div>
                                    {!item.isRead && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="mt-3 h-7 text-xs text-indigo-500 hover:text-indigo-300 hover:bg-indigo-500/10"
                                            onClick={async () => {
                                                await teacherApi.readNotification(item.id);
                                                loadNotifications();
                                            }}
                                        >
                                            标记已读
                                        </Button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="ghost"
                            data-testid="teacher-notification-read-all"
                            onClick={async () => {
                                await teacherApi.readAllNotifications();
                                loadNotifications();
                            }}
                            className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        >
                            全部已读
                        </Button>
                        <Button onClick={() => setShowNotifications(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-200">关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Session Warning Dialog */}
            <Dialog open={showSessionWarning && !sessionExpired} onOpenChange={setShowSessionWarning}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-amber-600 flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            会话即将过期
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            您的登录会话即将过期，请选择继续使用或退出登录。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={handleLogout} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">
                            退出登录
                        </Button>
                        <Button onClick={handleExtendSession} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            继续使用
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Session Expired Dialog */}
            <Dialog open={sessionExpired}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200" onInteractOutside={(e) => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle className="text-rose-600 flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            会话已过期
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            您的登录会话已过期，请重新登录。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => { setSessionExpired(false); navigate("/login", { replace: true }); }} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            重新登录
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
