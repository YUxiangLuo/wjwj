import { toast } from "sonner";
import { RouteErrorBoundary } from "@/components/PageErrorBoundary";
import { lazy, Suspense, useState } from "react";
import { BarChart3, BookOpen, ClipboardList, Download, KeyRound, LayoutDashboard, LogOut, PenLine, School } from "lucide-react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { IconButton } from "@/components/ui/button";
import { AppToaster } from "@/components/AppToaster";
import { LoadingStatus } from "@/components/LoadingStatus";
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { TEACHER_PASSWORD_POLICY } from "@/lib/password-policy";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useWorkspaceAuth } from "@/hooks/useWorkspaceAuth";
import { RequestError } from "@/components/RequestError";
import { getTeacherDocumentTitle } from "@/lib/document-title";
import { authApi, type TeacherUser } from "./api-client";
import { Login } from "./pages/Login";

const ClassManagement = lazy(async () => ({ default: (await import("./pages/ClassManagement")).ClassManagement }));
const Dashboard = lazy(async () => ({ default: (await import("./pages/Dashboard")).Dashboard }));
const GradeExport = lazy(async () => ({ default: (await import("./pages/GradeExport")).GradeExport }));
const GradingDetail = lazy(async () => ({ default: (await import("./pages/GradingDetail")).GradingDetail }));
const GradingManagement = lazy(async () => ({ default: (await import("./pages/GradingManagement")).GradingManagement }));
const StudentManagement = lazy(async () => ({ default: (await import("./pages/StudentManagement")).StudentManagement }));
const TaskManagement = lazy(async () => ({ default: (await import("./pages/TaskManagement")).TaskManagement }));
const TaskProgressDetail = lazy(async () => ({ default: (await import("./pages/TaskProgressDetail")).TaskProgressDetail }));
const TopicManagement = lazy(async () => ({ default: (await import("./pages/TopicManagement")).TopicManagement }));

function RouteLoading() {
    return <LoadingStatus className="min-h-[60vh]" label="正在加载教师端页面" />;
}

const menu = [
    { path: "/", label: "教学概览", icon: LayoutDashboard },
    { path: "/class", label: "班级管理", icon: School },
    { path: "/topic", label: "实验模板", icon: BookOpen },
    { path: "/task", label: "实验任务", icon: ClipboardList },
    { path: "/grading", label: "作业批改", icon: PenLine },
    { path: "/export", label: "成绩分析与导出", icon: Download },
];

function TeacherWorkspace({
    user,
    onLogout,
}: {
    user: TeacherUser;
    onLogout: () => Promise<void>;
}) {
    const location = useLocation();
    const [passwordOpen, setPasswordOpen] = useState(false);
    const passwordChange = usePasswordChange({
        policy: TEACHER_PASSWORD_POLICY,
        forbiddenSubstrings: [user.employeeId],
        onSubmit: authApi.changePassword,
        onSuccess: () => {
            setPasswordOpen(false);
        },
    });
    const title = menu.find((item) => item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path))?.label ?? "教师工作台";

    return (
        <>
            <WorkspaceShell
                sidebarTitle="教师工作台"
                sidebarIcon={BarChart3}
                menuItems={menu}
                sidebarFooter={
                    <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9"><AvatarFallback className="bg-navigation-active text-navigation-active-foreground">{user.name.charAt(0)}</AvatarFallback></Avatar>
                        <div className="min-w-0 flex-1"><p className="truncate text-label font-medium">{user.name}</p><p className="truncate text-meta text-navigation-muted">{user.employeeId}</p></div>
                    </div>
                }
                pageTitle={title}
                pageSubtitle="统计学虚拟仿真实验平台"
                headerActions={
                    <div className="flex items-center gap-1">
                        <IconButton aria-label="修改密码" variant="ghost" title="修改密码" onClick={() => { passwordChange.reset(); setPasswordOpen(true); }}><KeyRound className="h-5 w-5" /></IconButton>
                        <IconButton aria-label="退出登录" variant="ghost" title="退出登录" className="text-destructive hover:bg-destructive-muted hover:text-destructive" onClick={() => void onLogout()}><LogOut className="h-5 w-5" /></IconButton>
                    </div>
                }
            >
                <RouteErrorBoundary><Suspense fallback={<RouteLoading />}><Routes>
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
                    </Routes></Suspense></RouteErrorBoundary>
            </WorkspaceShell>
            <PasswordChangeDialog
                open={passwordOpen}
                onOpenChange={setPasswordOpen}
                title="修改密码"
                description="输入当前密码并设置新密码。"
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                errorFields={passwordChange.errorFields}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="保存"
            />
            <AppToaster />
        </>
    );
}

export function TeacherApp() {
    const location = useLocation();
    const { user, checking, error, retry } = useWorkspaceAuth(authApi.me);
    useDocumentTitle(getTeacherDocumentTitle(location.pathname));

    if (checking) return <LoadingStatus className="min-h-screen bg-background" label="正在验证教师登录状态" />;
    if (error) return <main className="min-h-screen bg-background p-8"><RequestError message={error} onRetry={() => void retry()} /></main>;
    if (location.pathname === "/login") return user ? <Navigate to="/" replace /> : <Login />;
    if (!user) return <Navigate to="/login" replace />;
    return <TeacherWorkspace
        user={user}
        onLogout={async () => {
            const response = await authApi.logout();
            if (!response.success) { toast.error("尚未安全退出，请检查网络后重试。不要将设备交给他人。"); return; }
        }}
    />;
}

export default TeacherApp;
