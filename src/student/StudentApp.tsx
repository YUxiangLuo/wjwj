import { useCallback, useEffect, useState } from "react";
import { Bell, ArrowLeft, Loader2, LogOut, User, Trash2, KeyRound, Sun, Moon } from "lucide-react";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
    Popover,
    PopoverContent,
    PopoverDescription,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";

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
import { TaskHall } from "./pages/TaskHall";
import { TopicDetails } from "./pages/TopicDetails";
import { ExperimentLayout } from "./pages/ExperimentLayout";
import { SubmissionPreview } from "./pages/SubmissionPreview";
import { SubmissionHistory } from "./pages/SubmissionHistory";
import { SubmissionDetailPage } from "./pages/SubmissionDetail";
import { Profile } from "./pages/Profile";
import { StudentProvider, useStudent } from "./contexts/StudentContext";
import { authApi } from "./api-client";
import { Login } from "./pages/Login";
import { clearLoginSuccess, setLoginRedirectReason, useLoginSuccessRecovery } from "@/hooks/useAuthRecovery";
import { STUDENT_LOGIN_REDIRECT_REASON_KEY, STUDENT_LOGIN_SUCCESS_KEY } from "./auth-keys";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { useTheme } from "@/components/ThemeProvider";
import { useSessionExpiryEvent, useSessionWarningTimeout } from "@/hooks/useSessionExpiry";
import { STUDENT_PASSWORD_POLICY } from "@/lib/password-policy";
import { cn } from "@/lib/utils";
import "./student.css";

function StudentAppContent() {
    const location = useLocation();
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    const isTaskHall = location.pathname === "/";
    const isLoginPage = location.pathname === "/login";
    const {
        currentUser,
        isLoading,
        unreadCount,
        refreshUser,
        notifications,
        refreshNotifications,
        markAllNotificationsAsRead,
        markNotificationAsRead,
        deleteNotification,
        refreshSession,
        sessionExpiresAt,
        authErrorCode,
        clearAuthState,
    } = useStudent();

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [showAuthStatusDialog, setShowAuthStatusDialog] = useState(false);
    const [authDialogCode, setAuthDialogCode] = useState<string | null>(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    function redirectToLoginWithReason(message: string) {
        setShowSessionWarning(false);
        setShowNotifications(false);
        setShowAccountMenu(false);
        setShowAuthStatusDialog(false);
        setShowLogoutConfirm(false);
        clearLoginSuccess(STUDENT_LOGIN_SUCCESS_KEY);
        setLoginRedirectReason(STUDENT_LOGIN_REDIRECT_REASON_KEY, message);
        clearAuthState();
        navigate("/login", { replace: true });
    }

    const { showSessionWarning, setShowSessionWarning } = useSessionWarningTimeout({
        enabled: !!currentUser && !isLoginPage,
        sessionExpiresAt,
        onExpire: redirectToLoginWithReason,
    });

    useEffect(() => {
        if (currentUser?.isFirstLogin) {
            setShowPasswordModal(true);
        }
    }, [currentUser]);

    const passwordChange = usePasswordChange({
        policy: STUDENT_PASSWORD_POLICY,
        forbiddenSubstrings: [currentUser?.studentId],
        onSubmit: authApi.changePassword,
        onSuccess: async () => {
            setShowPasswordModal(false);
            await refreshUser();
        },
    });

    useEffect(() => {
        if (!authErrorCode) {
            setShowAuthStatusDialog(false);
            setAuthDialogCode(null);
            return;
        }
        const hasLoginFlag = sessionStorage.getItem(STUDENT_LOGIN_SUCCESS_KEY) === "1";
        if (hasLoginFlag && (authErrorCode === "AUTH_004" || authErrorCode === "AUTH_005")) {
            setAuthDialogCode(authErrorCode);
            setShowAuthStatusDialog(true);
            clearLoginSuccess(STUDENT_LOGIN_SUCCESS_KEY);
        } else {
            setShowAuthStatusDialog(false);
            setAuthDialogCode(null);
        }
    }, [authErrorCode]);

    const handleReLogin = useCallback(() => {
        setShowAuthStatusDialog(false);
        setAuthDialogCode(null);
        navigate("/login", { replace: true });
    }, [navigate]);

    useSessionExpiryEvent({
        enabled: !!currentUser && !isLoginPage,
        eventName: "student:session-expired",
        onExpire: redirectToLoginWithReason,
    });

    const isRecoveringLogin = useLoginSuccessRecovery({
        enabled: !isLoginPage && !currentUser,
        loginSuccessKey: STUDENT_LOGIN_SUCCESS_KEY,
        onRecover: async () => {
            await refreshUser();
            await Promise.all([refreshNotifications(), refreshSession()]);
        },
    });

    const authStatusDialog = authDialogCode && showAuthStatusDialog ? (
        <Dialog open={showAuthStatusDialog} onOpenChange={setShowAuthStatusDialog}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>登录状态已变更</DialogTitle>
                    <DialogDescription>
                        {authDialogCode === "AUTH_005"
                            ? "您的账号已在其他设备登录。"
                            : "会话已过期，请重新登录。"}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={handleReLogin}>重新登录</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    ) : null;

    // 显示加载状态
    if (isLoading || isRecoveringLogin) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background">
                <Loader2 className="size-8 animate-spin text-primary" />
            </div>
        );
    }

    if (isLoginPage) {
        if (currentUser) {
            return <Navigate to="/" replace />;
        }
        return (
            <>
                <Login />
                {authStatusDialog}
            </>
        );
    }

    if (!currentUser) {
        if (authDialogCode && showAuthStatusDialog) {
            return (
                <>
                    <Login />
                    {authStatusDialog}
                </>
            );
        }
        return <Navigate to="/login" replace />;
    }

    if (currentUser.isFirstLogin) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
                <div className="w-full max-w-2xl rounded-lg border border-border bg-card/60 p-8 text-card-foreground shadow-2xl shadow-foreground/10">
                    <div className="flex flex-col gap-3 text-center">
                        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-primary text-xl font-bold text-primary-foreground shadow-lg shadow-primary/20">
                            L
                        </div>
                        <h1 className="text-2xl font-bold text-foreground">首次登录需完成密码更新</h1>
                        <p className="text-sm leading-6 text-muted-foreground">
                            为保护账号安全，修改密码前暂不开放任务、通知和实验操作。
                        </p>
                    </div>

                    <div className="mt-6 rounded-lg border border-border bg-background/50 p-4 text-sm text-muted-foreground">
                        当前账号：<span className="font-mono text-foreground">{currentUser.studentId}</span>
                    </div>
                </div>

                <PasswordChangeDialog
                    open={showPasswordModal}
                    onOpenChange={setShowPasswordModal}
                    allowClose={false}
                    title="首次登录请修改密码"
                    description="为保证账号安全，请设置新密码。"
                    form={passwordChange.form}
                    onFieldChange={passwordChange.setField}
                    error={passwordChange.error}
                    saving={passwordChange.saving}
                    onSubmit={passwordChange.submit}
                    submitLabel="保存"
                    submitTestId="student-password-save"
                    fieldTestIds={{
                        currentPassword: "student-password-current",
                        newPassword: "student-password-new",
                        confirmPassword: "student-password-confirm",
                    }}
                    showPolicyHints={true}
                    policyMinLength={STUDENT_PASSWORD_POLICY.minLength}
                    rules={passwordChange.rules}
                    forbiddenHintLabel="学号"
                />

                <Toaster richColors position="top-right" theme={theme} />
            </div>
        );
    }

    // 未登录时显示提示（实际应该跳转到登录页）
    const displayName = currentUser?.name ?? "访客";
    const displayInitial = displayName.charAt(0);
    const handleLogout = async () => {
        try {
            await authApi.logout();
        } finally {
            clearLoginSuccess(STUDENT_LOGIN_SUCCESS_KEY);
            clearAuthState();
            navigate("/login", { replace: true });
        }
    };

    return (
        <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/30">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        {!isTaskHall && (
                            <Link to="/">
                                <Button variant="ghost" size="icon">
                                    <ArrowLeft className="size-5" />
                                </Button>
                            </Link>
                        )}
                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20">
                                L
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-lg font-bold text-foreground transition-colors group-hover:text-foreground/80">统计学虚拟仿真实验室</h1>
                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Learning Lab</p>
                            </div>
                        </Link>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative"
                            data-testid="student-open-notifications"
                            onClick={() => {
                                setShowNotifications(true);
                                refreshNotifications();
                            }}
                        >
                            <Bell className="size-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-5 text-white ring-2 ring-background">
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                </span>
                            )}
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={toggleTheme}
                            title={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
                            aria-label={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
                        >
                            {theme === "light" ? <Moon className="size-5" /> : <Sun className="size-5" />}
                        </Button>

                        <Popover open={showAccountMenu} onOpenChange={setShowAccountMenu}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-full focus:ring-0"
                                    aria-label="打开账号菜单"
                                >
                                    <Avatar className="size-9 bg-muted">
                                        <AvatarFallback className="bg-primary text-primary-foreground font-medium text-sm" data-testid="student-avatar">
                                            {displayInitial}
                                        </AvatarFallback>
                                    </Avatar>
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-56 gap-0 rounded-xl border-border bg-popover p-0 text-popover-foreground shadow-xl">
                                <PopoverHeader className="gap-1 border-b border-border bg-muted/40 px-3 py-2.5">
                                    <PopoverTitle className="text-sm font-medium leading-none normal-case tracking-normal text-popover-foreground">
                                        {displayName}
                                    </PopoverTitle>
                                    <PopoverDescription className="mt-1.5 text-xs leading-none text-muted-foreground">
                                        {currentUser.studentId}
                                    </PopoverDescription>
                                </PopoverHeader>
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-popover-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                                    data-testid="student-nav-profile"
                                    onClick={() => {
                                        setShowAccountMenu(false);
                                        navigate("/profile");
                                    }}
                                >
                                    <User className="size-4 text-muted-foreground" />
                                    个人信息
                                </button>
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-popover-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                                    data-testid="student-open-password-modal"
                                    onClick={() => {
                                        setShowAccountMenu(false);
                                        passwordChange.clearError();
                                        setShowPasswordModal(true);
                                    }}
                                >
                                    <KeyRound className="size-4 text-muted-foreground" />
                                    修改密码
                                </button>
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
                                    data-testid="student-logout-trigger"
                                    onClick={() => {
                                        setShowAccountMenu(false);
                                        setShowLogoutConfirm(true);
                                    }}
                                >
                                    <LogOut className="size-4" />
                                    退出登录
                                </button>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <Routes>
                    <Route index element={<TaskHall />} />
                    <Route path="login" element={<Login />} />
                    <Route path="task/:taskId" element={<TopicDetails />} />
                    <Route path="task/:taskId/experiment" element={<ExperimentLayout />} />
                    <Route path="task/:taskId/preview" element={<SubmissionPreview />} />
                    <Route path="task/:taskId/history" element={<SubmissionHistory />} />
                    <Route path="submissions/:submissionId" element={<SubmissionDetailPage />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>

            <PasswordChangeDialog
                open={showPasswordModal}
                onOpenChange={setShowPasswordModal}
                allowClose={!currentUser?.isFirstLogin}
                title={currentUser?.isFirstLogin ? "首次登录请修改密码" : "修改密码"}
                description="为保证账号安全，请设置新密码。"
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="保存"
                submitTestId="student-password-save"
                fieldTestIds={{
                    currentPassword: "student-password-current",
                    newPassword: "student-password-new",
                    confirmPassword: "student-password-confirm",
                }}
                showPolicyHints={true}
                policyMinLength={STUDENT_PASSWORD_POLICY.minLength}
                rules={passwordChange.rules}
                forbiddenHintLabel="学号"
            />

            <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
                <DialogContent showCloseButton={false} className="max-w-lg">
                    <DialogHeader>
                        <div className="flex items-center justify-between gap-3">
                            <DialogTitle>通知</DialogTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markAllNotificationsAsRead()}
                                disabled={!notifications || notifications.unreadCount === 0}
                                className="text-xs"
                                data-testid="student-notification-read-all"
                            >
                                全部已读
                            </Button>
                        </div>
                        <DialogDescription>查看任务与批改提醒</DialogDescription>
                    </DialogHeader>
                    <div className="custom-scrollbar flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-2">
                        {!notifications || notifications.notifications.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">暂无通知</div>
                        ) : (
                            notifications.notifications.map((notice) => (
                                <div
                                    key={notice.id}
                                    className={cn(
                                        "rounded-lg border p-3 transition-all",
                                        notice.isRead
                                            ? "border-border/60 bg-background/60 opacity-70"
                                            : "border-border bg-muted/70 shadow-sm hover:bg-muted"
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <button
                                            type="button"
                                            className="flex-1 text-left"
                                            onClick={() => {
                                                if (!notice.isRead) {
                                                    markNotificationAsRead(notice.id);
                                                }
                                            }}
                                        >
                                            <div>
                                                <div className="text-sm font-medium text-foreground">
                                                    {notice.title}
                                                    {!notice.isRead && <span className="ml-2 inline-block size-1.5 rounded-full bg-destructive align-middle"></span>}
                                                </div>
                                                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                                    {notice.content}
                                                </div>
                                            </div>
                                        </button>
                                        <div className="flex items-start gap-1">
                                            <button
                                                type="button"
                                                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                onClick={() => deleteNotification(notice.id)}
                                                title="删除通知"
                                            >
                                                <Trash2 className="size-3.5" />
                                            </button>
                                            <div className="whitespace-nowrap pt-1 text-[10px] text-muted-foreground">
                                                {new Date(notice.createdAt).toLocaleString("zh-CN", {
                                                    timeZone: "Asia/Shanghai",
                                                    month: "2-digit",
                                                    day: "2-digit",
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showSessionWarning} onOpenChange={setShowSessionWarning}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>会话即将过期</DialogTitle>
                        <DialogDescription>会话将在 5 分钟内过期，是否继续？</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowSessionWarning(false)}>稍后</Button>
                        <Button
                            onClick={async () => {
                                await refreshUser();
                                await refreshSession();
                                setShowSessionWarning(false);
                            }}
                        >
                            继续使用
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>确认退出登录？</AlertDialogTitle>
                        <AlertDialogDescription>
                            退出后需要重新登录才能继续使用实验系统。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={async () => {
                                setShowLogoutConfirm(false);
                                await handleLogout();
                            }}
                        >
                            退出登录
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Toaster richColors position="top-right" theme={theme} />
        </div>
    );
}

export function StudentApp() {
    return (
        <StudentProvider>
            <StudentAppContent />
        </StudentProvider>
    );
}

export default StudentApp;
