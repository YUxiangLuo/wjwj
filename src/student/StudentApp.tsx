import { toast } from "sonner";
import { RouteErrorBoundary } from "@/components/PageErrorBoundary";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, BarChart3, KeyRound, LogOut, User } from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AppToaster } from "@/components/AppToaster";
import { LoadingStatus } from "@/components/LoadingStatus";
import { RequestError } from "@/components/RequestError";
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { SkipLink } from "@/components/SkipLink";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { STUDENT_PASSWORD_POLICY } from "@/lib/password-policy";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { getStudentDocumentTitle } from "@/lib/document-title";
import { authApi } from "./api-client";
import { StudentProvider, useStudent } from "./contexts/StudentContext";
import { Login } from "./pages/Login";

const ExperimentLayout = lazy(() => import("./pages/ExperimentLayout"));
const Profile = lazy(() => import("./pages/Profile"));
const SubmissionDetailPage = lazy(() => import("./pages/SubmissionDetail"));
const SubmissionPreview = lazy(() => import("./pages/SubmissionPreview"));
const TaskHall = lazy(() => import("./pages/TaskHall"));
const TopicDetails = lazy(() => import("./pages/TopicDetails"));

function LoadingScreen() {
    return <LoadingStatus className="min-h-screen bg-background" label="正在加载学生端" />;
}

function StudentAppContent() {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser, isLoading, authError, retry } = useStudent();
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    useEffect(() => { setShowAccountMenu(false); }, [location.pathname]);
    const [showPassword, setShowPassword] = useState(false);
    const [showLogout, setShowLogout] = useState(false);
    const accountMenuTriggerRef = useRef<HTMLButtonElement>(null);
    useDocumentTitle(getStudentDocumentTitle(location.pathname));
    const isLogin = location.pathname === "/login";
    const isTaskHall = location.pathname === "/";
    const passwordChange = usePasswordChange({
        policy: STUDENT_PASSWORD_POLICY,
        forbiddenSubstrings: [currentUser?.studentId],
        onSubmit: authApi.changePassword,
        onSuccess: () => setShowPassword(false),
    });
    if (isLoading) return <LoadingScreen />;
    if (authError) return (
        <main className="min-h-screen bg-background p-8 text-foreground">
            <RequestError message={authError} onRetry={retry} />
        </main>
    );
    if (isLogin) return currentUser ? <Navigate to="/" replace /> : <Login />;
    if (!currentUser) return <Navigate to="/login" replace />;

    const logout = async () => {
        const response = await authApi.logout();
        if (!response.success) {
            toast.error("尚未安全退出，请检查网络后重试。不要将设备交给他人。");
            return;
        }
    };

    return (
        <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary-muted">
            <SkipLink />
            <header className="sticky top-0 z-50 border-b border-navigation-border bg-navigation text-navigation-foreground">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-8">
                    <div className="flex items-center gap-3">
                        {!isTaskHall && (
                            <Button className="text-navigation-foreground hover:bg-navigation-active hover:text-navigation-active-foreground focus-visible:ring-navigation-foreground focus-visible:ring-offset-navigation" variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="返回">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        )}
                        <Link to="/" className="flex items-center gap-3 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-navigation-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-navigation">
                            <span className="grid h-9 w-9 place-items-center rounded-control border border-navigation-border bg-navigation-active text-navigation-active-foreground">
                                <BarChart3 className="h-5 w-5" />
                            </span>
                            <span>
                                <span className="block text-body font-semibold text-navigation-foreground">统计学虚拟仿真实验室</span>
                                <span className="block text-meta tracking-wide text-navigation-muted">Learning Lab</span>
                            </span>
                        </Link>
                    </div>

                    <Popover open={showAccountMenu} onOpenChange={setShowAccountMenu}>
                        <PopoverTrigger asChild><Button
                            ref={accountMenuTriggerRef}
                            variant="ghost"
                            className="h-10 rounded-control px-1 text-navigation-foreground hover:bg-navigation-active hover:text-navigation-active-foreground focus-visible:ring-navigation-foreground focus-visible:ring-offset-navigation"
                            aria-label="打开账户菜单"
                            aria-expanded={showAccountMenu}
                        >
                            <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-navigation-active text-navigation-active-foreground" data-testid="student-avatar">
                                    {currentUser.name.charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                        </Button></PopoverTrigger>
                            <PopoverContent align="end" aria-label="账户操作" className="w-56 overflow-hidden bg-card py-1 text-foreground">
                                <div className="border-b border-border px-3 py-2.5">
                                    <p className="text-label font-medium">{currentUser.name}</p>
                                    <p className="mt-1 text-meta text-muted-foreground">{currentUser.studentId}</p>
                                </div>
                                <button className="flex w-full items-center px-3 py-2.5 text-label hover:bg-muted" onClick={() => { setShowAccountMenu(false); navigate("/profile"); }}>
                                    <User className="mr-2 h-4 w-4" />个人信息
                                </button>
                                <button className="flex w-full items-center px-3 py-2.5 text-label hover:bg-muted" onClick={() => { setShowAccountMenu(false); passwordChange.reset(); setShowPassword(true); }}>
                                    <KeyRound className="mr-2 h-4 w-4" />修改密码
                                </button>
                                <button className="flex w-full items-center px-3 py-2.5 text-label text-destructive hover:bg-destructive-muted" onClick={() => { setShowAccountMenu(false); setShowLogout(true); }}>
                                    <LogOut className="mr-2 h-4 w-4" />退出登录
                                </button>
                            </PopoverContent>
                    </Popover>
                </div>
            </header>

            <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl py-8 px-8">
                <RouteErrorBoundary><Suspense fallback={<LoadingScreen />}><Routes>
                        <Route index element={<TaskHall />} />
                        <Route path="task/:taskId" element={<TopicDetails />} />
                        <Route path="task/:taskId/experiment" element={<ExperimentLayout />} />
                        <Route path="task/:taskId/preview" element={<SubmissionPreview />} />
                        <Route path="task/:taskId/result" element={<SubmissionDetailPage />} />
                        <Route path="profile" element={<Profile />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes></Suspense></RouteErrorBoundary>
            </main>

            <PasswordChangeDialog
                open={showPassword}
                onOpenChange={setShowPassword}
                title="修改密码"
                description="输入当前密码并设置新密码。"
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="保存"
            />

            <AlertDialog open={showLogout} onOpenChange={setShowLogout} fallbackFocusRef={accountMenuTriggerRef}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
                        <AlertDialogDescription>退出后需要重新登录才能继续实验。未完成阶段的草稿会保留在当前浏览器，最后编辑后保留 7 天。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction variant="destructive" onClick={() => void logout()}>退出</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            <AppToaster />
        </div>
    );
}

export function StudentApp() {
    return <StudentProvider><StudentAppContent /></StudentProvider>;
}

export default StudentApp;
