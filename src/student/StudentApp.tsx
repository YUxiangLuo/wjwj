import MuiAppBar from "@mui/material/AppBar";
import MuiToolbar from "@mui/material/Toolbar";
import { toast } from "sonner";
import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import { RouteErrorBoundary } from "@/components/PageErrorBoundary";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, BarChart3, KeyRound, LogOut, User } from "lucide-react";
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
import { cn } from "@/lib/utils";
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
        <div className="student-portal-shell min-h-screen bg-background font-sans text-foreground selection:bg-primary-muted">
            <SkipLink />
            <MuiAppBar
                component="header"
                position="sticky"
                elevation={0}
                color="inherit"
                className="top-0 z-50 border-b border-navigation-border bg-navigation text-navigation-foreground shadow-none"
            >
                <MuiToolbar
                    disableGutters
                    className="mx-auto flex h-16 min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-8"
                >
                    <div className="flex min-w-0 items-center gap-3">
                        {!isTaskHall && (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-navigation-foreground hover:bg-navigation-hover hover:text-navigation-hover-foreground focus-visible:ring-offset-navigation"
                                onClick={() => navigate(-1)}
                                aria-label="返回"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </Button>
                        )}
                        <Link
                            to="/"
                            className="flex items-center gap-3 rounded-pill pr-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-navigation"
                        >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-surface bg-navigation-active text-navigation-active-foreground">
                                <BarChart3 className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <span className="truncate text-subheading font-medium text-navigation-foreground">
                                商务统计虚拟仿真系统
                            </span>
                        </Link>
                        <nav aria-label="学生端主导航" className="ml-2 flex items-center gap-1">
                            <NavLink
                                to="/"
                                end
                                className={({ isActive }) =>
                                    cn(
                                        "inline-flex h-9 items-center rounded-pill px-4 text-label font-medium outline-none transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-navigation",
                                        isActive
                                            ? "bg-navigation-active text-navigation-active-foreground"
                                            : "text-navigation-muted hover:bg-navigation-hover hover:text-navigation-hover-foreground",
                                    )
                                }
                            >
                                实验大厅
                            </NavLink>
                            <NavLink
                                to="/profile"
                                className={({ isActive }) =>
                                    cn(
                                        "inline-flex h-9 items-center rounded-pill px-4 text-label font-medium outline-none transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-navigation",
                                        isActive
                                            ? "bg-navigation-active text-navigation-active-foreground"
                                            : "text-navigation-muted hover:bg-navigation-hover hover:text-navigation-hover-foreground",
                                    )
                                }
                            >
                                账号资料
                            </NavLink>
                        </nav>
                    </div>

                    <Popover open={showAccountMenu} onOpenChange={setShowAccountMenu}>
                        <PopoverTrigger asChild>
                            <Button
                                ref={accountMenuTriggerRef}
                                variant="ghost"
                                className={cn(
                                    "h-10 gap-2.5 rounded-pill pr-3 pl-1.5 font-medium focus-visible:ring-offset-navigation",
                                    showAccountMenu
                                        ? "bg-navigation-active text-navigation-active-foreground hover:bg-navigation-active hover:text-navigation-active-foreground"
                                        : "text-navigation-foreground hover:bg-navigation-hover hover:text-navigation-hover-foreground",
                                )}
                                aria-label="打开账户菜单"
                                aria-expanded={showAccountMenu}
                                // Unmounted popover content must not leave a dangling aria-controls target for axe.
                                aria-controls={showAccountMenu ? "student-account-menu" : undefined}
                            >
                                <Avatar className="h-8 w-8">
                                    <AvatarFallback
                                        className="bg-navigation-active text-meta font-medium text-navigation-active-foreground"
                                        data-testid="student-avatar"
                                    >
                                        {currentUser.name.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="max-w-28 truncate text-label">{currentUser.name}</span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent
                            id="student-account-menu"
                            align="end"
                            aria-label="账户操作"
                            className="w-60 overflow-hidden rounded-surface border border-border bg-popover p-1.5 text-popover-foreground shadow-floating"
                        >
                            <div className="mb-1 border-b border-border px-3 py-2.5">
                                <p className="text-label font-medium text-foreground">{currentUser.name}</p>
                                <p className="mt-0.5 text-meta tabular-nums text-muted-foreground">{currentUser.studentId}</p>
                            </div>
                            <button
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-label text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => { setShowAccountMenu(false); navigate("/profile"); }}
                            >
                                <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />个人信息
                            </button>
                            <button
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-label text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => { setShowAccountMenu(false); passwordChange.reset(); setShowPassword(true); }}
                            >
                                <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />修改密码
                            </button>
                            <button
                                type="button"
                                className="flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-label text-destructive outline-none hover:bg-destructive-muted focus-visible:ring-2 focus-visible:ring-ring"
                                onClick={() => { setShowAccountMenu(false); setShowLogout(true); }}
                            >
                                <LogOut className="h-4 w-4" aria-hidden="true" />退出登录
                            </button>
                        </PopoverContent>
                    </Popover>
                </MuiToolbar>
            </MuiAppBar>

            <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-8 py-6 outline-none">
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
                errorFields={passwordChange.errorFields}
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
        </div>
    );
}

export function StudentApp() {
    return (
        <MaterialThemeProvider>
            <StudentProvider><StudentAppContent /></StudentProvider>
            <AppToaster />
        </MaterialThemeProvider>
    );
}

export default StudentApp;
