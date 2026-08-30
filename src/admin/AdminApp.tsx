import { lazy, Suspense, useEffect, useState } from "react";
import { BarChart3, Calendar, GraduationCap, KeyRound, LayoutDashboard, LogOut, Megaphone, School, Users } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/button";
import { AppToaster } from "@/components/AppToaster";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { SkipLink } from "@/components/SkipLink";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { ADMIN_PASSWORD_POLICY } from "@/lib/password-policy";
import { DEV_AUTH_MODE } from "@/lib/dev-mode";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { AUTH_EXPIRED_EVENT } from "@/lib/auth-expired";
import { getAdminDocumentTitle } from "@/lib/document-title";
import { authApi, type AdminUser } from "./api-client";
import { Login } from "./pages/Login";

const AnnouncementManagement = lazy(async () => ({ default: (await import("./pages/AnnouncementManagement")).AnnouncementManagement }));
const ClassManagement = lazy(async () => ({ default: (await import("./pages/ClassManagement")).ClassManagement }));
const Dashboard = lazy(async () => ({ default: (await import("./pages/Dashboard")).Dashboard }));
const SemesterManagement = lazy(async () => ({ default: (await import("./pages/SemesterManagement")).SemesterManagement }));
const StudentManagement = lazy(async () => ({ default: (await import("./pages/StudentManagement")).StudentManagement }));
const TeacherManagement = lazy(async () => ({ default: (await import("./pages/TeacherManagement")).TeacherManagement }));

function RouteLoading() {
    return <LoadingStatus className="min-h-[60vh]" label="正在加载管理页面" />;
}

const menu = [
    { path: "/", label: "首页概览", icon: LayoutDashboard },
    { path: "/semester", label: "学期管理", icon: Calendar },
    { path: "/teacher", label: "教师管理", icon: Users },
    { path: "/class", label: "班级管理", icon: School },
    { path: "/student", label: "学生管理", icon: GraduationCap },
    { path: "/announcement", label: "公告管理", icon: Megaphone },
];

function AdminWorkspace({ user, onLogout, onPasswordChanged }: { user: AdminUser; onLogout: () => Promise<void>; onPasswordChanged: () => void }) {
    const location = useLocation();
    const [passwordOpen, setPasswordOpen] = useState(false);
    const mustChangePassword = !DEV_AUTH_MODE && user.isFirstLogin === 1;
    const passwordChange = usePasswordChange({
        policy: ADMIN_PASSWORD_POLICY,
        forbiddenSubstrings: [user.username],
        onSubmit: authApi.changePassword,
        onSuccess: () => {
            onPasswordChanged();
            setPasswordOpen(false);
        },
    });
    const title = menu.find((item) => item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path))?.label ?? "管理后台";

    return (
        <div className="flex min-h-screen bg-background text-foreground">
            <SkipLink />
            <WorkspaceSidebar
                title="系统管理"
                titleIcon={BarChart3}
                items={menu}
                footer={
                    <div className="flex items-center gap-3"><Avatar className="h-9 w-9"><AvatarFallback className="bg-primary text-primary-foreground">{user.username.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div><p className="text-sm font-medium">{user.username}</p><p className="text-xs text-muted-foreground">管理员</p></div></div>
                }
            />
            <main className="min-w-0 flex-1">
                <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 backdrop-blur px-6">
                    <div><h1 className="font-semibold">{title}</h1><p className="text-xs text-muted-foreground">内网教学系统</p></div>
                    <div className="flex items-center gap-1"><IconButton aria-label="修改密码" variant="ghost" title="修改密码" onClick={() => { passwordChange.reset(); setPasswordOpen(true); }}><KeyRound className="h-5 w-5" /></IconButton><IconButton aria-label="退出登录" variant="ghost" title="退出登录" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => void onLogout()}><LogOut className="h-5 w-5" /></IconButton></div>
                </header>
                <div id="main-content" tabIndex={-1} className="p-6">
                    {mustChangePassword ? (
                        <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">请先修改初始密码后再使用管理功能。</div>
                    ) : <Suspense fallback={<RouteLoading />}><Routes>
                            <Route index element={<Dashboard />} />
                            <Route path="semester" element={<SemesterManagement />} />
                            <Route path="teacher" element={<TeacherManagement />} />
                            <Route path="class" element={<ClassManagement />} />
                            <Route path="student" element={<StudentManagement />} />
                            <Route path="announcement" element={<AnnouncementManagement />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes></Suspense>}
                </div>
            </main>
            <PasswordChangeDialog open={mustChangePassword || passwordOpen} onOpenChange={(open) => { if (!mustChangePassword) setPasswordOpen(open); }} allowClose={!mustChangePassword} title={mustChangePassword ? "首次登录请修改密码" : "修改密码"} description={mustChangePassword ? "当前使用初始密码，设置新密码后才能进入管理后台。" : "输入当前密码并设置新密码。"} form={passwordChange.form} onFieldChange={passwordChange.setField} error={passwordChange.error} saving={passwordChange.saving} onSubmit={passwordChange.submit} submitLabel="保存" />
            <AppToaster />
        </div>
    );
}

export function AdminApp() {
    const location = useLocation();
    const navigate = useNavigate();
    const [checking, setChecking] = useState(true);
    const [user, setUser] = useState<AdminUser | null>(null);
    useDocumentTitle(getAdminDocumentTitle(location.pathname));
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
    if (checking) return <LoadingStatus className="min-h-screen bg-background" label="正在验证管理员登录状态" />;
    if (location.pathname === "/login") return user ? <Navigate to="/" replace /> : <Login />;
    if (!user) return <Navigate to="/login" replace />;
    return <AdminWorkspace
        user={user}
        onPasswordChanged={() => setUser((current) => current ? { ...current, isFirstLogin: 0 } : current)}
        onLogout={async () => { await authApi.logout(); setUser(null); navigate("/login", { replace: true }); }}
    />;
}

export default AdminApp;
