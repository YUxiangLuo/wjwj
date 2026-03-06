import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, HelpCircle, BarChart3, LineChart, PieChart, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "../api-client";

export function Login() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!username.trim() || !password) {
            setError("请输入用户名和密码");
            return;
        }

        setLoading(true);
        try {
            const res = await authApi.login({
                username: username.trim(),
                password,
            });
            if (res.success) {
                sessionStorage.setItem("admin_login_success", "1");
                navigate("/", { replace: true });
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
        <div className="min-h-screen grid lg:grid-cols-2 bg-slate-950 font-sans text-slate-200">
            {/* Left Side: Hero / Branding */}
            <div className="hidden lg:flex flex-col justify-between bg-slate-900 relative overflow-hidden p-12 border-r border-slate-800">
                <div className="absolute inset-0 z-0 opacity-40">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-slate-900 to-slate-950 z-10" />
                    <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-slate-900/5 to-transparent" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
                </div>

                <div className="relative z-20 flex items-center gap-3 text-xl font-semibold tracking-tight text-slate-100">
                    <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/20">
                        <BarChart3 className="w-6 h-6 text-white" />
                    </div>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">
                        统计学虚拟仿真实验平台
                    </span>
                </div>

                <div className="relative z-20 flex-1 flex flex-col justify-center max-w-lg">
                    <div className="relative">
                        <div className="absolute -top-10 -left-10 w-24 h-24 bg-indigo-500/30 rounded-full blur-3xl" />
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-sky-500/20 rounded-full blur-3xl" />
                        <h1 className="text-4xl sm:text-5xl font-bold leading-tight tracking-tight text-slate-100 mb-6">
                            探索数据背后的<br />
                            <span className="text-indigo-400">数学真理</span>
                        </h1>
                    </div>

                    <p className="text-lg text-slate-400 font-light leading-relaxed max-w-md">
                        通过沉浸式虚拟仿真实验，深入理解抽样分布、参数估计与假设检验的核心原理，掌握统计学的精髓。
                    </p>

                    <div className="mt-12 flex gap-8">
                        <div className="flex flex-col gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-slate-800/50 border border-slate-700 flex items-center justify-center text-indigo-400 shadow-lg">
                                <LineChart className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-medium text-slate-300">实时可视化</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-slate-800/50 border border-slate-700 flex items-center justify-center text-sky-400 shadow-lg">
                                <PieChart className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-medium text-slate-300">动态交互</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            <div className="w-12 h-12 rounded-2xl bg-slate-800/50 border border-slate-700 flex items-center justify-center text-emerald-400 shadow-lg">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <span className="text-sm font-medium text-slate-300">精准评估</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-20 text-sm text-slate-500">
                    © 2026 Sampling Simulation System. All rights reserved.
                </div>
            </div>

            {/* Right Side: Login Form */}
            <div className="flex flex-col justify-center items-center p-8 bg-slate-950 relative">
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
                        <h2 className="text-3xl font-bold tracking-tight text-slate-100">
                            管理员登录
                        </h2>
                        <p className="text-base text-slate-400">
                            请输入您的用户名和密码登录系统
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-5">
                            <div className="space-y-2.5">
                                <Label htmlFor="username" className="text-slate-300 text-sm font-medium ml-1">用户名</Label>
                                <Input
                                    id="username"
                                    data-testid="admin-login-username"
                                    placeholder="请输入用户名"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                    className="h-12 bg-slate-900 border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/20 text-slate-100 placeholder:text-slate-600 rounded-xl transition-all"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <div className="flex items-center justify-between ml-1">
                                    <Label htmlFor="password" className="text-slate-300 text-sm font-medium">密码</Label>
                                    <span className="text-xs font-medium text-indigo-300/80">
                                        忘记密码？请联系系统管理员通过后台重置
                                    </span>
                                </div>
                                <Input
                                    id="password"
                                    data-testid="admin-login-password"
                                    type="password"
                                    placeholder="请输入密码"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    className="h-12 bg-slate-900 border-slate-800 focus:border-indigo-500 focus:ring-indigo-500/20 text-slate-100 placeholder:text-slate-600 rounded-xl transition-all"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="p-4 text-sm text-rose-300 bg-rose-500/10 rounded-xl border border-rose-500/20 flex items-center gap-3 animate-in slide-in-from-top-2">
                                <div className="w-2 h-2 rounded-full bg-rose-500" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-4 pt-2">
                            <Button type="submit" data-testid="admin-login-submit" className="w-full h-12 text-base font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        登录中...
                                    </>
                                ) : (
                                    <>安全登录</>
                                )}
                            </Button>
                        </div>
                    </form>

                    <div className="flex justify-center gap-8 text-sm text-slate-500">
                        <span className="flex items-center gap-1.5 hover:text-slate-300 transition-colors cursor-pointer">
                            <HelpCircle className="w-4 h-4" />
                            使用指南
                        </span>
                        <span className="flex items-center gap-1.5 hover:text-slate-300 transition-colors cursor-pointer">
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
