import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, HelpCircle, BarChart3, LineChart, PieChart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markLoginSuccess, useLoginRedirectReason } from "@/hooks/useAuthRecovery";
import { authApi } from "../api-client";
import { STUDENT_LOGIN_REDIRECT_REASON_KEY, STUDENT_LOGIN_SUCCESS_KEY } from "../auth-keys";

export function Login() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState("student");
    const [password, setPassword] = useState("123456");

    useLoginRedirectReason({
        redirectReasonKey: STUDENT_LOGIN_REDIRECT_REASON_KEY,
        onReason: setError,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!username.trim() || !password) {
            setError("请输入学号和密码");
            return;
        }

        setLoading(true);
        try {
            const res = await authApi.login({
                studentId: username.trim(),
                password,
            });
            if (res.success && res.data) {
                markLoginSuccess(STUDENT_LOGIN_SUCCESS_KEY);
                navigate("/", { replace: true });
            } else {
                setError(res.error?.message || "登录失败，请检查账号密码");
            }
        } catch (err) {
            setError("网络错误，请稍后重试");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="grid min-h-screen bg-background font-sans text-foreground lg:grid-cols-2">
            <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-muted/30 p-12 lg:flex">
                <div className="absolute inset-0 z-0 opacity-40">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
                </div>

                <div className="relative z-20 flex items-center gap-3 text-xl font-semibold tracking-tight text-foreground">
                    <div className="rounded-xl bg-primary p-2 text-primary-foreground shadow-lg shadow-primary/20">
                        <BarChart3 className="size-6" />
                    </div>
                    <span>统计学虚拟仿真实验平台</span>
                </div>

                <div className="relative z-20 flex max-w-lg flex-1 flex-col justify-center">
                    <div>
                        <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
                            探索数据背后的<br />
                            <span className="text-primary">数学真理</span>
                        </h1>
                    </div>

                    <p className="max-w-md text-lg font-light leading-relaxed text-muted-foreground">
                        通过沉浸式虚拟仿真实验，深入理解抽样分布、参数估计与假设检验的核心原理，掌握统计学的精髓。
                    </p>

                    <div className="mt-12 flex gap-8">
                        <div className="flex flex-col gap-2">
                            <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-background/60 text-primary shadow-lg">
                                <LineChart className="size-6" />
                            </div>
                            <span className="text-sm font-medium text-foreground">实时可视化</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-background/60 text-primary shadow-lg">
                                <PieChart className="size-6" />
                            </div>
                            <span className="text-sm font-medium text-foreground">动态交互</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-background/60 text-primary shadow-lg">
                                <ShieldCheck className="size-6" />
                            </div>
                            <span className="text-sm font-medium text-foreground">精准评估</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-20 text-sm text-muted-foreground">
                    © 2026 Sampling Simulation System. All rights reserved.
                </div>
            </div>

            <div className="relative flex flex-col items-center justify-center bg-background p-8">
                <div className="absolute right-0 top-0 p-8 lg:hidden">
                    <div className="flex items-center gap-2 font-semibold">
                        <div className="rounded-lg bg-primary p-1.5 text-primary-foreground">
                            <BarChart3 className="size-4" />
                        </div>
                        SSS
                    </div>
                </div>

                <div className="flex w-full max-w-md flex-col gap-10">
                    <div className="flex flex-col gap-3 text-center">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">
                            学生登录
                        </h2>
                        <p className="text-base text-muted-foreground">
                            请输入您的学号和密码登录系统
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                        <div className="flex flex-col gap-5">
                            <div className="flex flex-col gap-2.5">
                                <Label htmlFor="username" className="ml-1 text-sm font-medium">学号</Label>
                                <Input
                                    id="username"
                                    data-testid="student-login-username"
                                    placeholder="请输入学号"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                    className="h-12"
                                />
                            </div>
                            <div className="flex flex-col gap-2.5">
                                <div className="ml-1 flex items-center justify-between">
                                    <Label htmlFor="password" className="text-sm font-medium">密码</Label>
                                    <span className="text-xs font-medium text-primary">
                                        忘记密码？请联系班级教师重置
                                    </span>
                                </div>
                                <Input
                                    id="password"
                                    data-testid="student-login-password"
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
                            <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive animate-in slide-in-from-top-2">
                                <div className="size-2 rounded-full bg-destructive" />
                                {error}
                            </div>
                        )}

                        <div className="flex flex-col gap-4 pt-2">
                            <Button type="submit" data-testid="student-login-submit" className="h-12 w-full text-base font-medium" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 data-icon="inline-start" className="animate-spin" />
                                        登录中...
                                    </>
                                ) : (
                                    <>安全登录</>
                                )}
                            </Button>
                            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/40 p-4">
                                <p className="text-center text-xs font-medium tracking-[0.2em] text-muted-foreground">
                                    其他端入口
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <Button variant="outline" className="h-11 w-full" asChild>
                                        <a href="/admin/login">管理员登录</a>
                                    </Button>
                                    <Button variant="outline" className="h-11 w-full" asChild>
                                        <a href="/teacher/login">教师登录</a>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </form>

                    <div className="flex justify-center gap-8 text-sm text-muted-foreground">
                        <span className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-foreground">
                            <HelpCircle className="size-4" />
                            使用指南
                        </span>
                        <span className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-foreground">
                            <Lock className="size-4" />
                            隐私政策
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
