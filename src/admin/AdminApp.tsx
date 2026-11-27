import { toast } from "sonner";
import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import { RouteErrorBoundary } from "@/components/PageErrorBoundary";
import { lazy, Suspense, useState } from "react";
import { BarChart3, Calendar, Compass, GraduationCap, KeyRound, LayoutDashboard, LogOut, Megaphone, School, Users } from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AppToaster } from "@/components/AppToaster";
import { IconTile } from "@/components/IconTile";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { ADMIN_PASSWORD_POLICY } from "@/lib/password-policy";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useWorkspaceAuth } from "@/hooks/useWorkspaceAuth";
import { RequestError } from "@/components/RequestError";
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

function AdminNotFound({ pathname }: { pathname: string }) {
    return (
        <section
            data-testid="admin-not-found"
            className="mx-auto max-w-xl rounded-surface border border-border bg-card p-8 text-center"
        >
            <IconTile intent="neutral" className="mx-auto mb-4 h-12 w-12">
                <Compass aria-hidden="true" className="h-6 w-6" />
            </IconTile>
            <h2 className="text-section-title font-medium text-foreground">未找到该管理页面</h2>
            <p className="mt-2 text-label text-muted-foreground">
                当前访问路径 <code className="rounded-control bg-muted px-1.5 py-0.5 font-mono text-meta text-foreground">/admin{pathname}</code> 不存在，请核对地址或前往常用管理模块。
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                <Button asChild>
                    <Link to="/">返回首页概览</Link>
                </Button>
                <Button asChild variant="outline">
                    <Link to="/semester">学期管理</Link>
                </Button>
                <Button asChild variant="outline">
                    <Link to="/class">班级管理</Link>
                </Button>
            </div>
        </section>
    );
}

function AdminWorkspace({ user, onLogout }: { user: AdminUser; onLogout: () => Promise<void> }) {
    const location = useLocation();
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);
    const passwordChange = usePasswordChange({
        policy: ADMIN_PASSWORD_POLICY,
        forbiddenSubstrings: [user.username],
        onSubmit: authApi.changePassword,
        onSuccess: () => {
            setPasswordOpen(false);
            toast.success("管理员密码已更新");
        },
    });
    const matchedMenu = menu.find((item) => (
        item.path === "/"
            ? location.pathname === "/"
            : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
    ));
    const title = matchedMenu?.label ?? "页面未找到";

    const handleLogout = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            await onLogout();
        } finally {
            setLoggingOut(false);
        }
    };

    return (
        <>
            <WorkspaceShell
                sidebarTitle="系统管理"
                sidebarIcon={BarChart3}
                menuItems={menu}
                sidebarFooter={
                    <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-navigation-active font-medium text-navigation-active-foreground">
                                {user.username.charAt(0).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-label font-medium text-navigation-foreground">{user.username}</p>
                            <p className="truncate text-meta text-navigation-muted">管理员</p>
                        </div>
                    </div>
                }
                pageTitle={title}
                pageSubtitle="商务统计虚拟仿真系统 · 系统管理控制台"
                headerActions={
                    <div className="flex shrink-0 items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label="修改密码"
                            onClick={() => {
                                passwordChange.reset();
                                setPasswordOpen(true);
                            }}
                        >
                            <KeyRound className="h-4 w-4" aria-hidden="true" />
                            修改密码
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label="退出登录"
                            disabled={loggingOut}
                            onClick={() => void handleLogout()}
                        >
                            <LogOut className="h-4 w-4" aria-hidden="true" />
                            退出登录
                        </Button>
                    </div>
                }
            >
                <RouteErrorBoundary>
                    <Suspense fallback={<RouteLoading />}>
                        <Routes>
                            <Route index element={<Dashboard />} />
                            <Route path="semester" element={<SemesterManagement />} />
                            <Route path="teacher" element={<TeacherManagement />} />
                            <Route path="class" element={<ClassManagement />} />
                            <Route path="student" element={<StudentManagement />} />
                            <Route path="announcement" element={<AnnouncementManagement />} />
                            <Route path="*" element={<AdminNotFound pathname={location.pathname} />} />
                        </Routes>
                    </Suspense>
                </RouteErrorBoundary>
            </WorkspaceShell>
            <PasswordChangeDialog
                open={passwordOpen}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) passwordChange.reset();
                    setPasswordOpen(nextOpen);
                }}
                title="修改密码"
                description="管理员新密码须至少 12 位，包含字母、数字和特殊字符，且不能包含用户名。"
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                errorFields={passwordChange.errorFields}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="保存"
                showPolicyHints={true}
                policyMinLength={ADMIN_PASSWORD_POLICY.minLength}
                rules={passwordChange.rules}
                forbiddenHintLabel={ADMIN_PASSWORD_POLICY.forbiddenLabel}
            />
        </>
    );
}

export function AdminApp() {
    const location = useLocation();
    const { user, checking, error, retry } = useWorkspaceAuth(authApi.me);
    useDocumentTitle(getAdminDocumentTitle(location.pathname));

    const content = checking
        ? <LoadingStatus className="min-h-screen bg-background" label="正在验证管理员登录状态" />
        : error
            ? <main className="min-h-screen bg-background p-8"><RequestError message={error} onRetry={() => void retry()} /></main>
            : location.pathname === "/login"
                ? (user ? <Navigate to="/" replace /> : <Login />)
                : !user
                    ? <Navigate to="/login" replace />
                    : (
                        <AdminWorkspace
                            user={user}
                            onLogout={async () => {
                                const response = await authApi.logout();
                                if (!response.success) {
                                    toast.error("尚未安全退出，请检查网络后重试。不要将设备交给他人。");
                                    return;
                                }
                            }}
                        />
                    );

    return (
        <MaterialThemeProvider>
            {content}
            <AppToaster />
        </MaterialThemeProvider>
    );
}

export default AdminApp;
