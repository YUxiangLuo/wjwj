import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, KeyRound, LogOut, User } from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AppToaster } from "@/components/AppToaster";
import { LoadingStatus } from "@/components/LoadingStatus";
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
import { DEV_AUTH_MODE } from "@/lib/dev-mode";
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
    const { currentUser, isLoading, refreshUser, clearAuthState } = useStudent();
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showLogout, setShowLogout] = useState(false);
    useDocumentTitle(getStudentDocumentTitle(location.pathname));
    const isLogin = location.pathname === "/login";
    const isTaskHall = location.pathname === "/";
    const passwordChange = usePasswordChange({
        policy: STUDENT_PASSWORD_POLICY,
        forbiddenSubstrings: [currentUser?.studentId],
        onSubmit: authApi.changePassword,
        onSuccess: async () => {
            await refreshUser();
            setShowPassword(false);
        },
    });
    const mustChangePassword = !DEV_AUTH_MODE && currentUser?.isFirstLogin === 1;

    useEffect(() => {
        if (mustChangePassword) setShowPassword(true);
    }, [mustChangePassword]);

    if (isLoading) return <LoadingScreen />;
    if (isLogin) return currentUser ? <Navigate to="/" replace /> : <Login />;
    if (!currentUser) return <Navigate to="/login" replace />;

    const logout = async () => {
        await authApi.logout();
        clearAuthState();
        navigate("/login", { replace: true });
    };

    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
            <SkipLink />
            <header className="sticky top-0 z-50 border-b border-border bg-card/80 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-8">
                    <div className="flex items-center gap-3">
                        {!isTaskHall && (
                            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="返回">
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        )}
                        <Link to="/" className="flex items-center gap-3">
                            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                                <BarChart3 className="h-5 w-5" />
                            </span>
                            <span>
                                <span className="block text-base font-bold">统计学虚拟仿真实验室</span>
                                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">Learning Lab</span>
                            </span>
                        </Link>
                    </div>

                    <div className="relative">
                        <Button
                            variant="ghost"
                            className="h-10 rounded-full px-1"
                            aria-label="打开账户菜单"
                            aria-expanded={showAccountMenu}
                            onClick={() => setShowAccountMenu((value) => !value)}
                        >
                            <Avatar className="h-9 w-9">
                                <AvatarFallback className="bg-primary text-primary-foreground" data-testid="student-avatar">
                                    {currentUser.name.charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                        </Button>
                        {showAccountMenu && (
                            <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl">
                                <div className="border-b border-border px-3 py-2.5">
                                    <p className="text-sm font-medium">{currentUser.name}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{currentUser.studentId}</p>
                                </div>
                                <button className="flex w-full items-center px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { setShowAccountMenu(false); navigate("/profile"); }}>
                                    <User className="mr-2 h-4 w-4" />个人信息
                                </button>
                                <button className="flex w-full items-center px-3 py-2.5 text-sm hover:bg-muted" onClick={() => { setShowAccountMenu(false); passwordChange.reset(); setShowPassword(true); }}>
                                    <KeyRound className="mr-2 h-4 w-4" />修改密码
                                </button>
                                <button className="flex w-full items-center px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10" onClick={() => { setShowAccountMenu(false); setShowLogout(true); }}>
                                    <LogOut className="mr-2 h-4 w-4" />退出登录
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl py-8 px-8">
                {mustChangePassword ? (
                    <div className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground">请先修改初始密码后再开始实验。</div>
                ) : <Suspense fallback={<LoadingScreen />}><Routes>
                        <Route index element={<TaskHall />} />
                        <Route path="task/:taskId" element={<TopicDetails />} />
                        <Route path="task/:taskId/experiment" element={<ExperimentLayout />} />
                        <Route path="task/:taskId/preview" element={<SubmissionPreview />} />
                        <Route path="task/:taskId/result" element={<SubmissionDetailPage />} />
                        <Route path="profile" element={<Profile />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes></Suspense>}
            </main>

            <PasswordChangeDialog
                open={mustChangePassword || showPassword}
                onOpenChange={(open) => { if (!mustChangePassword) setShowPassword(open); }}
                allowClose={!mustChangePassword}
                title={mustChangePassword ? "首次登录请修改密码" : "修改密码"}
                description={mustChangePassword ? "当前使用初始或重置密码，设置新密码后才能进入实验。" : "输入当前密码并设置新密码。"}
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="保存"
            />

            <AlertDialog open={showLogout} onOpenChange={setShowLogout}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
                        <AlertDialogDescription>退出后需要重新登录才能继续实验。</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void logout()}>退出</AlertDialogAction>
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
