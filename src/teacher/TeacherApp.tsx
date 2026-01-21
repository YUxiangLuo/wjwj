import { useEffect, useState } from "react";
import {
    LayoutDashboard, School, BookOpen, ClipboardList, PenLine, Users, Download, Bell, LogOut, Loader2
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

import { Dashboard } from "./pages/Dashboard";
import { ClassManagement } from "./pages/ClassManagement";
import { StudentManagement } from "./pages/StudentManagement";
import { TopicManagement } from "./pages/TopicManagement";
import { TaskManagement } from "./pages/TaskManagement";
import { GradingManagement } from "./pages/GradingManagement";
import { GradingDetail } from "./pages/GradingDetail";
import { AssistantManagement } from "./pages/AssistantManagement";
import { GradeExport } from "./pages/GradeExport";
import { Login } from "./pages/Login";

const menuItems = [
    { path: "/", label: "首页概览", icon: LayoutDashboard },
    { path: "/class", label: "班级管理", icon: School },
    { path: "/topic", label: "课题管理", icon: BookOpen },
    { path: "/task", label: "任务管理", icon: ClipboardList },
    { path: "/grading", label: "作业批改", icon: PenLine },
    { path: "/assistant", label: "助教管理", icon: Users },
    { path: "/export", label: "成绩导出", icon: Download },
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

export function TeacherApp() {
    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;
    const isLoginPage = currentPath === "/login" || currentPath.endsWith("/login");
    // Get base path for title (e.g., /class/1/students -> /class)
    const basePath = "/" + (currentPath.split("/")[1] || "");
    const pageTitle = pageTitles[basePath] ?? "教师端";

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
                    if (res.data?.isFirstLogin) {
                        setShowPasswordModal(true);
                    }
                } else {
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
        if (authState !== "authed") return;
        let cancelled = false;
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
        return () => {
            cancelled = true;
        };
    }, [authState]);
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

    const handleChangePassword = async () => {
        setPasswordError(null);
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setPasswordError("请填写完整信息");
            return;
        }
        if (passwordForm.newPassword.length < 8) {
            setPasswordError("新密码长度至少为8位");
            return;
        }
        if (!/[A-Za-z]/.test(passwordForm.newPassword) || !/\d/.test(passwordForm.newPassword) || !/[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+~`]/.test(passwordForm.newPassword)) {
            setPasswordError("新密码需包含字母、数字和特殊字符");
            return;
        }
        if (teacherUser?.employeeId && passwordForm.newPassword.includes(teacherUser.employeeId)) {
            setPasswordError("新密码不能包含工号");
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

    // Additional logic for dynamic titles could go here if needed

    return (
        <div className="flex min-h-screen bg-slate-50">
            <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
                <div className="h-20 px-6 border-b border-slate-200 flex items-center">
                    <div>
                        <h1 className="text-base font-semibold text-slate-900">抽样统计系统</h1>
                        <p className="text-xs text-slate-500 mt-1">教师端</p>
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
                                        ? "bg-blue-50 text-blue-600"
                                        : "text-slate-600 hover:bg-slate-100"
                                    }`}
                            >
                                <Icon className={`w-4 h-4 ${isActive ? "text-blue-600" : "text-slate-500"}`} />
                                <span className="font-medium">{item.label}</span>
                                {item.path === "/grading" && pendingGradingCount > 0 && (
                                    <Badge variant="destructive" className="ml-auto text-xs px-2 py-0.5">
                                        {pendingGradingCount}
                                    </Badge>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                <Separator className="bg-slate-200" />

                <div className="p-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9">
                            <AvatarFallback className="bg-blue-50 text-blue-600 text-sm">
                                {teacherUser?.name?.charAt(0) ?? "师"}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-sm font-medium text-slate-900">{teacherUser?.name ?? "教师"}</div>
                            <div className="text-xs text-slate-500">{teacherUser?.employeeId ?? ""}</div>
                        </div>
                    </div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white px-8 h-20 border-b border-slate-200 flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-semibold text-slate-900">{pageTitle}</h2>
                        <span className="text-sm text-slate-500">
                            {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative"
                            onClick={async () => {
                                await loadNotifications();
                                setShowNotifications(true);
                            }}
                        >
                            <Bell className="w-5 h-5 text-slate-600" />
                            {unreadCount > 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full"></span>
                            )}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowPasswordModal(true)} title="修改密码">
                            修改密码
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleLogout} title="退出登录">
                            <LogOut className="w-5 h-5 text-slate-600" />
                        </Button>
                    </div>
                </header>
                <div className="flex-1 p-8 overflow-y-auto">
                    <Routes>
                        <Route index element={<Dashboard />} />
                        <Route path="login" element={<Login />} />
                        <Route path="class" element={<ClassManagement />} />
                        <Route path="class/:classId/students" element={<StudentManagement />} />
                        <Route path="topic" element={<TopicManagement />} />
                        <Route path="task" element={<TaskManagement />} />
                        <Route path="grading" element={<GradingManagement />} />
                        <Route path="grading/:submissionId" element={<GradingDetail />} />
                        <Route path="assistant" element={<AssistantManagement />} />
                        <Route path="export" element={<GradeExport />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </div>
            </main>

            <Dialog open={showPasswordModal} onOpenChange={(open) => {
                if (teacherUser?.isFirstLogin) return;
                setShowPasswordModal(open);
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{teacherUser?.isFirstLogin ? "首次登录请修改密码" : "修改密码"}</DialogTitle>
                        <DialogDescription>
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
                        {!teacherUser?.isFirstLogin && (
                            <Button variant="outline" onClick={() => setShowPasswordModal(false)} disabled={passwordSaving}>
                                取消
                            </Button>
                        )}
                        <Button onClick={handleChangePassword} disabled={passwordSaving}>
                            {passwordSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>通知</DialogTitle>
                        <DialogDescription>最近通知</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 max-h-[360px] overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-6">暂无通知</div>
                        ) : (
                            notifications.map((item) => (
                                <div key={item.id} className="border rounded-md p-3">
                                    <div className="flex items-center justify-between">
                                        <div className={`text-sm font-medium ${item.isRead ? "text-foreground" : "text-primary"}`}>{item.title}</div>
                                        <span className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground mt-1">{item.content}</div>
                                    {!item.isRead && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="mt-2"
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
                            variant="outline"
                            onClick={async () => {
                                await teacherApi.readAllNotifications();
                                loadNotifications();
                            }}
                        >
                            全部已读
                        </Button>
                        <Button onClick={() => setShowNotifications(false)}>关闭</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
