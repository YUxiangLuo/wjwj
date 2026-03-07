import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, ArrowLeft, Loader2, ChevronDown, LogOut, User, Menu, Trash2, KeyRound, Sun, Moon } from "lucide-react";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
    const [showAuthDialog, setShowAuthDialog] = useState(false);
    const [authDialogCode, setAuthDialogCode] = useState<string | null>(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    function redirectToLoginWithReason(message: string) {
        setShowSessionWarning(false);
        setShowNotifications(false);
        setShowAuthDialog(false);
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
            setShowAuthDialog(false);
            setAuthDialogCode(null);
            return;
        }
        const hasLoginFlag = sessionStorage.getItem(STUDENT_LOGIN_SUCCESS_KEY) === "1";
        if (hasLoginFlag && (authErrorCode === "AUTH_004" || authErrorCode === "AUTH_005")) {
            setAuthDialogCode(authErrorCode);
            setShowAuthDialog(true);
            clearLoginSuccess(STUDENT_LOGIN_SUCCESS_KEY);
        } else {
            setShowAuthDialog(false);
            setAuthDialogCode(null);
        }
    }, [authErrorCode]);

    const handleReLogin = useCallback(() => {
        setShowAuthDialog(false);
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

    const authStatusDialog = authDialogCode && showAuthDialog ? (
        <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-slate-100">登录状态已变更</DialogTitle>
                    <DialogDescription className="text-slate-400">
                        {authDialogCode === "AUTH_005"
                            ? "您的账号已在其他设备登录。"
                            : "会话已过期，请重新登录。"}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button onClick={handleReLogin} className="bg-indigo-600 hover:bg-indigo-700 text-white">重新登录</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    ) : null;

    // 显示加载状态
    if (isLoading || isRecoveringLogin) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
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
        if (authDialogCode && showAuthDialog) {
            return (
                <>
                    <Login />
                    {authStatusDialog}
                </>
            );
        }
        return <Navigate to="/login" replace />;
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
        <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/80 backdrop-blur supports-[backdrop-filter]:bg-slate-900/60">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        {!isTaskHall && (
                            <Link to="/">
                                <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-100 hover:bg-slate-800">
                                    <ArrowLeft className="w-5 h-5" />
                                </Button>
                            </Link>
                        )}
                        <Link to="/" className="flex items-center gap-3 group">
                            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 flex items-center justify-center text-white font-bold text-lg">
                                L
                            </div>
                            <div className="flex flex-col">
                                <h1 className="text-lg font-bold text-slate-100 group-hover:text-slate-200 transition-colors">统计学虚拟仿真实验室</h1>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Learning Lab</p>
                            </div>
                        </Link>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                            data-testid="student-open-notifications"
                            onClick={() => {
                                setShowNotifications(true);
                                refreshNotifications();
                            }}
                        >
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold leading-5 text-center ring-2 ring-slate-900">
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                </span>
                            )}
                        </Button>

                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                            onClick={toggleTheme}
                            title={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
                            aria-label={theme === "light" ? "切换到深色模式" : "切换到浅色模式"}
                        >
                            {theme === "light" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                        </Button>

                        <div className="relative">
                            <Button
                                variant="ghost"
                                className="relative h-10 w-10 rounded-full hover:bg-slate-800 focus:ring-0 px-0"
                                onClick={() => setShowAuthDialog(prev => !prev)}
                            >
                                <Avatar className="h-9 w-9 border border-slate-700 bg-slate-800">
                                    <AvatarFallback className="bg-indigo-600 text-white font-medium text-sm" data-testid="student-avatar">
                                        {displayInitial}
                                    </AvatarFallback>
                                </Avatar>
                            </Button>

                            {/* Custom Dropdown Menu */}
                            {showAuthDialog && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowAuthDialog(false)}></div>
                                    <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-900 shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="px-3 py-2.5 border-b border-slate-800 bg-slate-900/50">
                                            <p className="text-sm font-medium leading-none text-slate-100">{displayName}</p>
                                            <p className="text-xs leading-none text-slate-500 mt-1.5">{currentUser.studentId}</p>
                                        </div>
                                        <button
                                            className="w-full flex items-center px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer text-left"
                                            data-testid="student-nav-profile"
                                            onClick={() => {
                                                setShowAuthDialog(false);
                                                navigate("/profile");
                                            }}
                                        >
                                            <User className="mr-2 h-4 w-4 text-slate-400" />
                                            个人信息
                                        </button>
                                        <button
                                            className="w-full flex items-center px-3 py-2.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors cursor-pointer text-left"
                                            data-testid="student-open-password-modal"
                                            onClick={() => {
                                                setShowAuthDialog(false);
                                                passwordChange.clearError();
                                                setShowPasswordModal(true);
                                            }}
                                        >
                                            <KeyRound className="mr-2 h-4 w-4 text-slate-400" />
                                            修改密码
                                        </button>
                                        <button
                                            className="w-full flex items-center px-3 py-2.5 text-sm text-rose-600 hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer text-left"
                                            data-testid="student-logout-trigger"
                                            onClick={() => {
                                                setShowAuthDialog(false);
                                                setShowLogoutConfirm(true);
                                            }}
                                        >
                                            <LogOut className="mr-2 h-4 w-4 text-rose-600" />
                                            退出登录
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500">
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
                <DialogContent className="max-w-lg bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between text-slate-100">
                            通知
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => markAllNotificationsAsRead()}
                                disabled={!notifications || notifications.unreadCount === 0}
                                className="text-xs text-indigo-500 hover:text-indigo-600 hover:bg-indigo-500/10"
                                data-testid="student-notification-read-all"
                            >
                                全部已读
                            </Button>
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">查看任务与批改提醒</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                        {!notifications || notifications.notifications.length === 0 ? (
                            <div className="text-sm text-slate-500 text-center py-8">暂无通知</div>
                        ) : (
                            notifications.notifications.map((notice) => (
                                <div
                                    key={notice.id}
                                    className={`p-3 rounded-lg border transition-all ${notice.isRead ? "bg-slate-950 border-slate-800/50 opacity-70" : "bg-slate-800 border-slate-700 shadow-sm hover:bg-slate-800/80"}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <button
                                            className="flex-1 text-left"
                                            onClick={() => {
                                                if (!notice.isRead) {
                                                    markNotificationAsRead(notice.id);
                                                }
                                            }}
                                        >
                                            <div>
                                                <div className="text-sm font-medium text-slate-200">
                                                    {notice.title}
                                                    {!notice.isRead && <span className="ml-2 inline-block w-1.5 h-1.5 bg-rose-500 rounded-full align-middle"></span>}
                                                </div>
                                                <div className="text-xs text-slate-400 mt-1 line-clamp-2">
                                                    {notice.content}
                                                </div>
                                            </div>
                                        </button>
                                        <div className="flex items-start gap-1">
                                            <button
                                                type="button"
                                                className="h-7 w-7 rounded-md text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center"
                                                onClick={() => deleteNotification(notice.id)}
                                                title="删除通知"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                            <div className="text-[10px] text-slate-500 whitespace-nowrap pt-1">
                                                {new Date(notice.createdAt).toLocaleString("zh-CN", {
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
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">会话即将过期</DialogTitle>
                        <DialogDescription className="text-slate-400">会话将在 5 分钟内过期，是否继续？</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowSessionWarning(false)} className="text-slate-400 hover:text-slate-100 hover:bg-slate-800">稍后</Button>
                        <Button
                            onClick={async () => {
                                await refreshUser();
                                await refreshSession();
                                setShowSessionWarning(false);
                            }}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        >
                            继续使用
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
                <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-slate-100">确认退出登录？</AlertDialogTitle>
                        <AlertDialogDescription className="text-slate-400">
                            退出后需要重新登录才能继续使用实验系统。
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-slate-100">取消</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                setShowLogoutConfirm(false);
                                await handleLogout();
                            }}
                            className="bg-rose-600 hover:bg-rose-700 text-white"
                        >
                            退出登录
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
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
