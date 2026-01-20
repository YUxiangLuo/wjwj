import { useState, useEffect } from "react";
import {
    LayoutDashboard, Calendar, Users, GraduationCap, School, UserCheck,
    Activity, Megaphone, Settings, Bell, LogOut, Loader2
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
import { authApi, systemApi, type AdminUser } from "./api-client";
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
    const isLoginPage = currentPath === "/login";
    const pageTitle = pageTitles[currentPath] ?? "管理后台";
    const [unreadCount, setUnreadCount] = useState(0);
    const [isAuthed, setIsAuthed] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);
    const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);

    useEffect(() => {
        if (isLoginPage || !isAuthed) return;

        // Initial fetch
        fetchNotifications();

        // Poll every minute
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, [isLoginPage, isAuthed]);

    useEffect(() => {
        let cancelled = false;
        if (isLoginPage) {
            setAuthChecked(true);
            return;
        }

        if (authChecked) return;

        authApi
            .me()
            .then((res) => {
                if (cancelled) return;
                if (res.success) {
                    setIsAuthed(true);
                    setAdminUser(res.data ?? null);
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
                setAdminUser(null);
                navigate("/login", { replace: true });
            })
            .finally(() => {
                if (!cancelled) setAuthChecked(true);
            });

        return () => {
            cancelled = true;
        };
    }, [isLoginPage, navigate, authChecked]);

    const fetchNotifications = async () => {
        try {
            const res = await systemApi.getNotifications();
            if (res.success && res.data) {
                setUnreadCount(res.data.count);
            }
        } catch (err) {
            console.error(err);
        }
    };

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
        return <Login />;
    }

    if (!authChecked) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!isAuthed) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="flex min-h-screen bg-muted/40">
            {/* Sidebar */}
            <aside className="w-60 bg-slate-800 text-white flex flex-col shrink-0">
                <div className="p-6 border-b border-white/10">
                    <h1 className="text-lg font-semibold">抽样统计系统</h1>
                    <p className="text-xs text-white/70 mt-1">管理后台</p>
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
                            </NavLink>
                        );
                    })}
                </nav>

                <Separator className="bg-white/10" />

                <div className="p-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-white/20 text-white text-sm">管</AvatarFallback>
                        </Avatar>
                        <div>
                            <div className="text-sm font-medium">管理员</div>
                            <div className="text-xs text-white/70">Administrator</div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-background px-8 py-4 border-b flex justify-between items-center">
                    <h2 className="text-xl font-semibold text-foreground">{pageTitle}</h2>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground mr-2">
                            {new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" })}
                        </span>
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="w-5 h-5 text-muted-foreground" />
                            {unreadCount > 0 && (
                                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
                            )}
                        </Button>

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" title="退出登录">
                                    <LogOut className="w-5 h-5 text-muted-foreground" />
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
        </div>
    );
}

export default AdminApp;
