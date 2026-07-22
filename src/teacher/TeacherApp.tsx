import { useEffect, useState } from "react";
import { BarChart3, BookOpen, ClipboardList, Download, KeyRound, LayoutDashboard, Loader2, LogOut, Menu, PenLine, School, X } from "lucide-react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { TEACHER_PASSWORD_POLICY } from "@/lib/password-policy";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { AUTH_EXPIRED_EVENT } from "@/lib/auth-expired";
import { authApi, type TeacherUser } from "./api-client";
import { ClassManagement } from "./pages/ClassManagement";
import { Dashboard } from "./pages/Dashboard";
import { GradeExport } from "./pages/GradeExport";
import { GradingDetail } from "./pages/GradingDetail";
import { GradingManagement } from "./pages/GradingManagement";
import { Login } from "./pages/Login";
import { StudentManagement } from "./pages/StudentManagement";
import { TaskManagement } from "./pages/TaskManagement";
import { TaskProgressDetail } from "./pages/TaskProgressDetail";
import { TopicManagement } from "./pages/TopicManagement";

const menu = [
    { path: "/", label: "教学概览", icon: LayoutDashboard },
    { path: "/class", label: "班级管理", icon: School },
    { path: "/topic", label: "课题管理", icon: BookOpen },
    { path: "/task", label: "任务管理", icon: ClipboardList },
    { path: "/grading", label: "作业批改", icon: PenLine },
    { path: "/export", label: "成绩导出", icon: Download },
];

function TeacherWorkspace({
    user,
    onLogout,
    onPasswordChanged,
}: {
    user: TeacherUser;
    onLogout: () => Promise<void>;
    onPasswordChanged: () => void;
}) {
    const location = useLocation();
    const [sidebar, setSidebar] = useState(false);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const mustChangePassword = user.isFirstLogin === 1;
    const passwordChange = usePasswordChange({
        policy: TEACHER_PASSWORD_POLICY,
        forbiddenSubstrings: [user.employeeId],
        onSubmit: authApi.changePassword,
        onSuccess: () => {
            onPasswordChanged();
            setPasswordOpen(false);
        },
    });
    const title = menu.find((item) => item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path))?.label ?? "教师工作台";

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform lg:static lg:translate-x-0 ${sidebar ? "translate-x-0" : "-translate-x-full"}`}>
                <div className="flex h-16 items-center justify-between border-b border-border px-5">
                    <div className="flex items-center gap-2.5 font-semibold">
                        <span className="rounded-xl bg-primary p-2 text-primary-foreground"><BarChart3 className="h-5 w-5" /></span>
                        教师工作台
                    </div>
                    <button className="lg:hidden" onClick={() => setSidebar(false)}><X className="h-5 w-5" /></button>
                </div>
                <nav className="flex-1 space-y-1 p-3">
                    {menu.map((item) => {
                        const Icon = item.icon;
                        return (
                            <NavLink key={item.path} to={item.path} end={item.path === "/"} onClick={() => setSidebar(false)} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                                <Icon className="h-4 w-4" />{item.label}
                            </NavLink>
                        );
                    })}
                </nav>
                <div className="border-t border-border p-4">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary text-primary-foreground">{user.name.charAt(0)}</AvatarFallback></Avatar>
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.employeeId}</p></div>
                    </div>
                </div>
            </aside>
            {sidebar && <button className="fixed inset-0 z-40 bg-overlay/50 lg:hidden" onClick={() => setSidebar(false)} aria-label="关闭菜单" />}

            <main className="min-w-0 flex-1">
                <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur sm:px-6">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebar(true)}><Menu className="h-5 w-5" /></Button>
                        <div><h1 className="font-semibold">{title}</h1><p className="text-xs text-muted-foreground">统计学虚拟仿真实验平台</p></div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" title="修改密码" onClick={() => { passwordChange.reset(); setPasswordOpen(true); }}><KeyRound className="h-5 w-5" /></Button>
                        <Button variant="ghost" size="icon" title="退出登录" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => void onLogout()}><LogOut className="h-5 w-5" /></Button>
                    </div>
                </header>
                <div className="p-4 sm:p-6">
                    {mustChangePassword ? (
                        <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">请先修改初始密码后再使用教学功能。</div>
                    ) : <Routes>
                        <Route index element={<Dashboard />} />
                        <Route path="class" element={<ClassManagement />} />
                        <Route path="class/:classId/students" element={<StudentManagement />} />
                        <Route path="topic" element={<TopicManagement />} />
                        <Route path="task" element={<TaskManagement />} />
                        <Route path="task/:taskId/progress" element={<TaskProgressDetail />} />
                        <Route path="grading" element={<GradingManagement />} />
                        <Route path="grading/:submissionId" element={<GradingDetail />} />
                        <Route path="export" element={<GradeExport />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>}
                </div>
            </main>
            <PasswordChangeDialog
                open={mustChangePassword || passwordOpen}
                onOpenChange={(open) => { if (!mustChangePassword) setPasswordOpen(open); }}
                allowClose={!mustChangePassword}
                title={mustChangePassword ? "首次登录请修改密码" : "修改密码"}
                description={mustChangePassword ? "当前使用初始或重置密码，设置新密码后才能进入教学工作台。" : "输入当前密码并设置新密码。"}
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="保存"
            />
            <Toaster richColors position="top-right" />
        </div>
    );
}

export function TeacherApp() {
    const location = useLocation();
    const navigate = useNavigate();
    const [checking, setChecking] = useState(true);
    const [user, setUser] = useState<TeacherUser | null>(null);
    useEffect(() => {
        const clearUser = () => setUser(null);
        window.addEventListener(AUTH_EXPIRED_EVENT, clearUser);
        return () => window.removeEventListener(AUTH_EXPIRED_EVENT, clearUser);
    }, []);
    useEffect(() => {
        void authApi.me().then((response) => {
            setUser(response.success && response.data ? response.data : null);
            setChecking(false);
        });
    }, []);
    if (checking) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
    if (location.pathname === "/login") return user ? <Navigate to="/" replace /> : <Login />;
    if (!user) return <Navigate to="/login" replace />;
    return <TeacherWorkspace
        user={user}
        onPasswordChanged={() => setUser((current) => current ? { ...current, isFirstLogin: 0 } : current)}
        onLogout={async () => { await authApi.logout(); setUser(null); navigate("/login", { replace: true }); }}
    />;
}

export default TeacherApp;
