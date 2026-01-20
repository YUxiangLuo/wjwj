import { useEffect, useState } from "react";
import { Bell, LogOut, ArrowLeft, Loader2 } from "lucide-react";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TaskHall } from "./pages/TaskHall";
import { TopicDetails } from "./pages/TopicDetails";
import { ExperimentLayout } from "./pages/ExperimentLayout";
import { SubmissionPreview } from "./pages/SubmissionPreview";
import { SubmissionHistory } from "./pages/SubmissionHistory";
import { SubmissionDetailPage } from "./pages/SubmissionDetail";
import { StudentProvider, useStudent } from "./contexts/StudentContext";
import { authApi } from "./api-client";
import { Login } from "./pages/Login";
import "./student.css";

function StudentAppContent() {
    const location = useLocation();
    const navigate = useNavigate();
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
        refreshSession,
        sessionExpiresAt,
        authErrorCode,
    } = useStudent();

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [showNotifications, setShowNotifications] = useState(false);
    const [showSessionWarning, setShowSessionWarning] = useState(false);
    const [showSessionExpired, setShowSessionExpired] = useState(false);
    const [showAuthDialog, setShowAuthDialog] = useState(false);

    useEffect(() => {
        if (currentUser?.isFirstLogin) {
            setShowPasswordModal(true);
        }
    }, [currentUser]);

    useEffect(() => {
        if (authErrorCode) {
            setShowAuthDialog(true);
        }
    }, [authErrorCode]);

    useEffect(() => {
        if (!sessionExpiresAt) return;
        const expiresAt = new Date(sessionExpiresAt).getTime();
        if (!Number.isFinite(expiresAt)) return;
        const now = Date.now();
        const warnAt = expiresAt - 5 * 60 * 1000;

        const warnDelay = Math.max(0, warnAt - now);
        const expireDelay = Math.max(0, expiresAt - now);

        const warnTimer = window.setTimeout(() => {
            setShowSessionWarning(true);
        }, warnDelay);
        const expireTimer = window.setTimeout(() => {
            setShowSessionExpired(true);
        }, expireDelay);

        return () => {
            window.clearTimeout(warnTimer);
            window.clearTimeout(expireTimer);
        };
    }, [sessionExpiresAt]);

    // 显示加载状态
    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (isLoginPage) {
        return <Login />;
    }

    if (!currentUser) {
        if (authErrorCode) {
            return (
                <>
                    <Login />
                    <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>登录状态已变更</DialogTitle>
                                <DialogDescription>
                                    {authErrorCode === "AUTH_005"
                                        ? "您的账号已在其他设备登录。"
                                        : "会话已过期，请重新登录。"}
                                </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                                <Button onClick={() => navigate("/login", { replace: true })}>重新登录</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
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
            navigate("/login", { replace: true });
        }
    };

    const handleChangePassword = async () => {
        setPasswordError(null);
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setPasswordError("请填写完整信息");
            return;
        }
        if (passwordForm.newPassword.length < 8) {
            setPasswordError("新密码长度至少为8位");
            return;
        }
        if (!/[A-Za-z]/.test(passwordForm.newPassword) || !/\d/.test(passwordForm.newPassword) || !/[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+~`]/.test(passwordForm.newPassword)) {
            setPasswordError("新密码需包含字母、数字和特殊字符");
            return;
        }
        if (currentUser?.studentId && passwordForm.newPassword.includes(currentUser.studentId)) {
            setPasswordError("新密码不能包含学号");
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
                await refreshUser();
            } else {
                setPasswordError(res.error?.message ?? "修改失败");
            }
        } catch (err) {
            setPasswordError(err instanceof Error ? err.message : "修改失败");
        } finally {
            setPasswordSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <header className="bg-white border-b sticky top-0 z-50">
                <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        {!isTaskHall && (
                            <Link to="/">
                                <Button variant="ghost" size="icon">
                                    <ArrowLeft className="w-5 h-5" />
                                </Button>
                            </Link>
                        )}
                        <div>
                            <h1 className="text-xl font-semibold text-slate-800">抽样统计虚拟仿真系统</h1>
                            <p className="text-sm text-muted-foreground">学生端</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="relative"
                            onClick={() => {
                                setShowNotifications(true);
                                refreshNotifications();
                            }}
                        >
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </span>
                            )}
                        </Button>
                        <div className="flex items-center gap-2">
                            <Avatar className="w-8 h-8">
                                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                                    {displayInitial}
                                </AvatarFallback>
                            </Avatar>
                            <span className="text-sm font-medium">{displayName}</span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleLogout}>
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-6xl mx-auto px-6 py-8">
                {/* Welcome Section - only on task hall */}
                {isTaskHall && (
                    <div className="mb-8">
                        <h2 className="text-2xl font-bold text-slate-800">你好，{displayName}</h2>
                        <p className="text-muted-foreground mt-1">欢迎回来，继续你的实验之旅吧</p>
                    </div>
                )}

                <Routes>
                    <Route index element={<TaskHall />} />
                    <Route path="login" element={<Login />} />
                    <Route path="task/:taskId" element={<TopicDetails />} />
                    <Route path="task/:taskId/experiment" element={<ExperimentLayout />} />
                    <Route path="task/:taskId/preview" element={<SubmissionPreview />} />
                    <Route path="task/:taskId/history" element={<SubmissionHistory />} />
                    <Route path="submissions/:submissionId" element={<SubmissionDetailPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </main>

            <Dialog open={showPasswordModal} onOpenChange={(open) => {
                if (currentUser?.isFirstLogin) return;
                setShowPasswordModal(open);
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{currentUser?.isFirstLogin ? "首次登录请修改密码" : "修改密码"}</DialogTitle>
                        <DialogDescription>为保证账号安全，请设置新密码。</DialogDescription>
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
                        {!currentUser?.isFirstLogin && (
                            <Button variant="outline" onClick={() => setShowPasswordModal(false)} disabled={passwordSaving}>
                                取消
                            </Button>
                        )}
                        <Button onClick={handleChangePassword} disabled={passwordSaving}>
                            {passwordSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center justify-between">
                            通知
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => markAllNotificationsAsRead()}
                                disabled={!notifications || notifications.unreadCount === 0}
                            >
                                全部已读
                            </Button>
                        </DialogTitle>
                        <DialogDescription>查看任务与批改提醒</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                        {!notifications || notifications.notifications.length === 0 ? (
                            <div className="text-sm text-muted-foreground text-center py-8">暂无通知</div>
                        ) : (
                            notifications.notifications.map((notice) => (
                                <button
                                    key={notice.id}
                                    className={`w-full text-left p-3 rounded-lg border transition-colors ${notice.isRead ? "bg-white" : "bg-red-50"}`}
                                    onClick={() => {
                                        if (!notice.isRead) {
                                            markNotificationAsRead(notice.id);
                                        }
                                    }}
                                >
                        <Dialog open={showSessionWarning} onOpenChange={setShowSessionWarning}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>会话即将过期</DialogTitle>
                                    <DialogDescription>会话将在 5 分钟内过期，是否继续？</DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button variant="outline" onClick={() => setShowSessionWarning(false)}>稍后</Button>
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

                        <Dialog open={showSessionExpired} onOpenChange={setShowSessionExpired}>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>会话已过期</DialogTitle>
                                    <DialogDescription>请重新登录以继续使用系统。</DialogDescription>
                                </DialogHeader>
                                <DialogFooter>
                                    <Button onClick={() => navigate("/login", { replace: true })}>重新登录</Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-medium">
                                                {notice.title}
                                                {!notice.isRead && <span className="ml-2 text-xs text-red-500">未读</span>}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {notice.content}
                                            </div>
                                        </div>
                                        <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                                            {new Date(notice.createdAt).toLocaleString("zh-CN", {
                                                month: "2-digit",
                                                day: "2-digit",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>
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
