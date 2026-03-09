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
        <div className="min-h-screen grid lg:grid-cols-2 bg-white dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-200">
            {/* Left Side: Hero / Branding */}
            <div className="hidden lg:flex flex-col justify-between bg-slate-50 dark:bg-slate-900 relative overflow-hidden p-12 border-r border-slate-200 dark:border-slate-800">
                <div className="absolute inset-0 z-0 opacity-40">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-slate-50 dark:via-slate-900 to-white dark:to-slate-950 z-10" />
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-slate-50/5 dark:via-slate-900/5 to-transparent" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
                </div>

                <div className="relative z-20 flex items-center gap-3 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                    <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                        <BarChart3 className="w-6 h-6 text-white" />
                    </div>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 dark:from-slate-100 to-slate-600 dark:to-slate-400">
                        统计学虚拟仿真实验平台
                    </span>
                </div>

                <div className="relative z-20 flex-1 flex flex-col justify-center max-w-lg">
                    <div className="relative">
                        <div className="absolute -top-10 -left-10 w-24 h-24 bg-indigo-500/30 rounded-full blur-3xl" />
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-sky-500/20 rounded-full blur-3xl" />
                        <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-slate-900 dark:text-slate-100 mb-6">
                            探索数据背后的<br />
                            <span className="text-indigo-500">数学真理</span>
                        </h1>
                    </div>

                    <p className="text-lg text-slate-600 dark:text-slate-400 font-light leading-relaxed max-w-md">
                        通过沉浸式虚拟仿真实验，深入理解抽样分布、参数估计与假设检验的核心原理，掌握统计学的精髓。
                    </p>

                    <div className="mt-12 flex gap-8">
                        <div className="flex flex-col gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-indigo-500 shadow-lg">
                                <LineChart className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">实时可视化</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-sky-600 shadow-lg">
                                <PieChart className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">动态交互</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-slate-200/50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-emerald-600 shadow-lg">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">精准评估</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-20 text-sm text-slate-500">
                    © 2026 Sampling Simulation System. All rights reserved.
                </div>
            </div>

            {/* Right Side: Login Form */}
            <div className="flex flex-col justify-center items-center p-8 bg-white dark:bg-slate-950 relative">
                <div className="absolute top-0 right-0 p-8 lg:hidden">
                    <div className="flex items-center gap-2 font-semibold">
                        <div className="bg-indigo-600 p-1.5 rounded-lg">
                            <BarChart3 className="w-4 h-4 text-white" />
                        </div>
                        SSS
                    </div>
                </div>

                <div className="w-full max-w-md space-y-10">
                    <div className="flex flex-col space-y-3 text-center">
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                            学生登录
                        </h2>
                        <p className="text-base text-slate-600 dark:text-slate-400">
                            请输入您的学号和密码登录系统
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-5">
                            <div className="space-y-2.5">
                                <Label htmlFor="username" className="text-slate-700 dark:text-slate-300 text-sm font-medium ml-1">学号</Label>
                                <Input
                                    id="username"
                                    data-testid="student-login-username"
                                    placeholder="请输入学号"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                    className="h-12 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/20 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 rounded-xl transition-all"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <div className="flex items-center justify-between ml-1">
                                    <Label htmlFor="password" className="text-slate-700 dark:text-slate-300 text-sm font-medium">密码</Label>
                                    <span className="text-xs font-medium text-indigo-700/80 dark:text-indigo-300/80">
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
                                    className="h-12 bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/20 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 rounded-xl transition-all"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 text-sm text-rose-600 bg-rose-500/10 rounded-xl border border-rose-500/20 flex items-center gap-3 animate-in slide-in-from-top-2">
                                <div className="w-2 h-2 rounded-full bg-rose-500" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-4 pt-2">
                            <Button type="submit" data-testid="student-login-submit" className="w-full h-12 text-base font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        登录中...
                                    </>
                                ) : (
                                    <>安全登录</>
                                )}
                            </Button>
                            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 p-4 space-y-3">
                                <p className="text-xs font-medium tracking-[0.2em] text-slate-500 dark:text-slate-400 text-center">
                                    其他端入口
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    <a
                                        href="/admin/login"
                                        className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-medium text-slate-700 dark:text-slate-200 transition-all hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-500/60 dark:hover:text-indigo-300"
                                    >
                                        管理员登录
                                    </a>
                                    <a
                                        href="/teacher/login"
                                        className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-medium text-slate-700 dark:text-slate-200 transition-all hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-500/60 dark:hover:text-indigo-300"
                                    >
                                        教师登录
                                    </a>
                                </div>
                            </div>
                        </div>
                    </form>

                    <div className="flex justify-center gap-8 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer">
                            <HelpCircle className="w-4 h-4" />
                            使用指南
                        </span>
                        <span className="flex items-center gap-1.5 hover:text-slate-700 dark:hover:text-slate-300 transition-colors cursor-pointer">
                            <Lock className="w-4 h-4" />
                            隐私政策
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
