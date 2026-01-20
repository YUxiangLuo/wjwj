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
import { authApi, type TeacherUser } from "./api-client";

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
    { path: "/grading", label: "作业批改", icon: PenLine, badge: 12 },
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
    const isLoginPage = currentPath === "/login";
    // Get base path for title (e.g., /class/1/students -> /class)
    const basePath = "/" + (currentPath.split("/")[1] || "");
    const pageTitle = pageTitles[basePath] ?? "教师端";

    const [authChecked, setAuthChecked] = useState(false);
    const [authLoading, setAuthLoading] = useState(false);
    const [isAuthed, setIsAuthed] = useState(false);
    const [teacherUser, setTeacherUser] = useState<TeacherUser | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (isLoginPage) {
            setAuthChecked(false);
            setAuthLoading(false);
            return;
        }

        if (authChecked && isAuthed) return;

        setAuthLoading(true);
        authApi
            .me()
            .then((res) => {
                if (cancelled) return;
                if (res.success) {
                    setIsAuthed(true);
                    setTeacherUser(res.data ?? null);
                    if (res.data?.isFirstLogin) {
                        setShowPasswordModal(true);
                    }
                } else {
                    setIsAuthed(false);
                    navigate("/login", { replace: true });
                }
            })
            .catch(() => {
                if (cancelled) return;
                setIsAuthed(false);
                navigate("/login", { replace: true });
            })
            .finally(() => {
                if (!cancelled) {
                    setAuthChecked(true);
                    setAuthLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [isLoginPage, navigate, authChecked, isAuthed]);

    const handleLogout = async () => {
        try {
            await authApi.logout();
        } finally {
            navigate("/login", { replace: true });
        }
    };

    const handleChangePassword = async () => {
        setPasswordError(null);
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setPasswordError("请填写完整信息");
            return;
        }
        if (passwordForm.newPassword.length < 6) {
            setPasswordError("新密码长度至少为6位");
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
        return <Login />;
    }

    if (authLoading || !authChecked) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!isAuthed) {
        return <Navigate to="/login" replace />;
    }

    // Additional logic for dynamic titles could go here if needed

    return (
        <div className="flex min-h-screen bg-muted/40">
            <aside className="w-60 bg-slate-800 text-white flex flex-col shrink-0">
                <div className="p-6 border-b border-white/10">
                    <h1 className="text-lg font-semibold">抽样统计系统</h1>
                    <p className="text-xs text-white/70 mt-1">教师端</p>
                </div>

                <nav className="flex-1 py-4 overflow-y-auto">
                    {menuItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = item.path === "/" ? currentPath === "/" : currentPath.startsWith(item.path);
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={`flex items-center gap-3 px-6 py-3 text-sm font-normal border-l-[3px] transition-colors
                                    ${isActive
                                        ? "bg-primary/20 text-primary border-primary"
                                        : "text-white/70 hover:bg-white/10 hover:text-white border-transparent"
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{item.label}</span>
                                {item.badge && (
                                    <Badge variant="destructive" className="ml-auto text-xs px-2 py-0.5">{item.badge}</Badge>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                <Separator className="bg-white/10" />

                <div className="p-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                                {teacherUser?.name?.charAt(0) ?? "师"}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-sm font-medium">{teacherUser?.name ?? "教师"}</div>
                            <div className="text-xs text-white/70">{teacherUser?.employeeId ?? ""}</div>
                        </div>
                    </div>
                </div>
            </aside>

            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-background px-8 py-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-foreground">{pageTitle}</h2>
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="sm" className="relative">
                            <Bell className="w-5 h-5" />
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-white text-xs rounded-full flex items-center justify-center">2</span>
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" })}
                        </span>
                        <Button variant="ghost" size="sm" onClick={handleLogout} title="退出登录">
                            <LogOut className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowPasswordModal(true)} title="修改密码">
                            修改密码
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
        </div>
    );
}
