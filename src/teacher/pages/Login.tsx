import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, HelpCircle, BarChart3, LineChart, PieChart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markLoginSuccess, useLoginRedirectReason } from "@/hooks/useAuthRecovery";
import { authApi } from "../api-client";
import { TEACHER_LOGIN_REDIRECT_REASON_KEY, TEACHER_LOGIN_SUCCESS_KEY } from "../auth-keys";

export function Login() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState("teacher");
    const [password, setPassword] = useState("123456");

    useLoginRedirectReason({
        redirectReasonKey: TEACHER_LOGIN_REDIRECT_REASON_KEY,
        onReason: setError,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!username.trim() || !password) {
            setError("请输入工号/账号和密码");
            return;
        }

        setLoading(true);
        try {
            const res = await authApi.login({
                employeeId: username.trim(),
                password,
            });
            if (res.success) {
                markLoginSuccess(TEACHER_LOGIN_SUCCESS_KEY);
                if (res.data?.user?.type === "assistant") {
                    navigate("/grading", { replace: true });
                } else {
                    navigate("/", { replace: true });
                }
            } else {
                setError(res.error?.message ?? "登录失败");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "登录失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-background font-sans text-foreground">
            {/* Left Side: Hero / Branding */}
            <div className="hidden lg:flex flex-col justify-between bg-card relative overflow-hidden p-12 border-r border-border">
                <div className="absolute inset-0 z-0 opacity-40">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-card to-background z-10" />
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-card/5 to-transparent" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:24px_24px]" />
                </div>

                <div className="relative z-20 flex items-center gap-3 text-xl font-semibold tracking-tight">
                    <div className="bg-primary p-2">
                        <BarChart3 className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <span className="font-heading uppercase tracking-wider text-foreground">
                        统计学虚拟仿真实验平台
                    </span>
                </div>

                <div className="relative z-20 flex-1 flex flex-col justify-center max-w-lg">
                    <div className="relative">
                        <div className="absolute -top-10 -left-10 w-24 h-24 bg-primary/30 rounded-full blur-3xl" />
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl" />
                        <h1 className="text-4xl sm:text-5xl font-bold font-heading leading-tight tracking-tighter mb-6">
                            探索数据背后的<br />
                            <span className="text-primary">数学真理</span>
                        </h1>
                    </div>

                    <p className="text-lg text-muted-foreground font-light leading-relaxed max-w-md">
                        通过沉浸式虚拟仿真实验，深入理解抽样分布、参数估计与假设检验的核心原理，掌握统计学的精髓。
                    </p>

                    <div className="mt-12 flex gap-8">
                        <div className="flex flex-col gap-2">
                            <div className="w-12 h-12 flex items-center justify-center text-primary bg-primary/10 border border-primary/20">
                                <LineChart className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-medium">实时可视化</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="w-12 h-12 flex items-center justify-center text-primary bg-primary/10 border border-primary/20">
                                <PieChart className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-medium">动态交互</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="w-12 h-12 flex items-center justify-center text-emerald-600 bg-emerald-500/10 border border-emerald-500/20">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-medium">精准评估</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-20 text-sm text-muted-foreground">
                    © 2026 Sampling Simulation System. All rights reserved.
                </div>
            </div>

            {/* Right Side: Login Form */}
            <div className="flex flex-col justify-center items-center p-8 bg-background relative">
                <div className="absolute top-0 right-0 p-8 lg:hidden">
                    <div className="flex items-center gap-2 font-semibold font-heading">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        SSS
                    </div>
                </div>

                <div className="w-full max-w-md space-y-10">
                    <div className="flex flex-col space-y-3 text-center">
                        <h2 className="text-3xl font-bold font-heading uppercase tracking-wider">
                            教师登录
                        </h2>
                        <p className="text-base text-muted-foreground">
                            请输入您的工号/助教账号和密码登录系统
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-5">
                            <div className="space-y-2.5">
                                <Label htmlFor="username" className="text-sm font-medium ml-1">工号/助教账号</Label>
                                <Input
                                    id="username"
                                    data-testid="teacher-login-username"
                                    placeholder="请输入工号或助教账号"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                    className="h-12"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <div className="flex items-center justify-between ml-1">
                                    <Label htmlFor="password" className="text-sm font-medium">密码</Label>
                                    <span className="text-xs font-medium text-muted-foreground">
                                        忘记密码？请联系系统管理员重置
                                    </span>
                                </div>
                                <Input
                                    id="password"
                                    data-testid="teacher-login-password"
                                    type="password"
                                    placeholder="请输入密码"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    className="h-12"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 text-sm text-destructive bg-destructive/10 border border-destructive/20 flex items-center gap-3 animate-in slide-in-from-top-2">
                                <div className="w-2 h-2 rounded-full bg-destructive" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-4 pt-2">
                            <Button type="submit" data-testid="teacher-login-submit" className="w-full h-12 text-base font-medium hover:scale-[1.02] active:scale-[0.98]" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        登录中...
                                    </>
                                ) : (
                                    <>安全登录</>
                                )}
                            </Button>
                            <div className="border border-border bg-muted p-4 space-y-3">
                                <p className="text-xs font-medium tracking-[0.2em] text-muted-foreground text-center font-heading uppercase">
                                    其他端入口
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <a
                                        href="/admin/login"
                                        className="inline-flex h-11 items-center justify-center border border-border bg-card text-sm font-medium text-foreground transition-all hover:border-primary hover:text-primary"
                                    >
                                        管理员登录
                                    </a>
                                    <a
                                        href="/student/login"
                                        className="inline-flex h-11 items-center justify-center border border-border bg-card text-sm font-medium text-foreground transition-all hover:border-primary hover:text-primary"
                                    >
                                        学生登录
                                    </a>
                                </div>
                            </div>
                        </div>
                    </form>

                    <div className="flex justify-center gap-8 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer">
                            <HelpCircle className="w-4 h-4" />
                            使用指南
                        </span>
                        <span className="flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer">
                            <Lock className="w-4 h-4" />
                            隐私政策
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;
