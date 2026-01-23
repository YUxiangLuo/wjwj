import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, FlaskConical, Loader2, PlayCircle, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { authApi } from "../api-client";
import { useStudent } from "../contexts/StudentContext";

export function Login() {
    const navigate = useNavigate();
    const { refreshUser, refreshNotifications } = useStudent();
    const [studentId, setStudentId] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const res = await authApi.login({ studentId, password });
            if (res.success && res.data) {
                // Store global login success flag
                sessionStorage.setItem("student_login_success", "1");

                // Refresh context
                await refreshUser();
                await refreshNotifications();

                navigate("/", { replace: true });
            } else {
                setError(res.error?.message || "登录失败，请检查账号密码");
            }
        } catch (err) {
            setError("网络错误，请稍后重试");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen w-full bg-slate-950 overflow-hidden">
            {/* Left Panel - Dark / Branding */}
            <div className="hidden w-1/2 lg:flex flex-col justify-between bg-slate-900 p-8 xl:p-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=2029&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 to-slate-900/90 z-0"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/30 flex items-center justify-center text-white">
                            <FlaskConical className="h-6 w-6" />
                        </div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Virtual Lab</h1>
                    </div>
                </div>

                <div className="relative z-10 space-y-6 max-w-lg">
                    <h2 className="text-4xl font-extrabold text-white tracking-tight leading-tight">
                        探索数据背后的 <span className="text-indigo-400">真相</span>
                    </h2>
                    <p className="text-lg text-slate-400 leading-relaxed">
                        欢迎来到抽样统计虚拟仿真实验室。在这里，您将体验从问卷设计、样本采集到数据分析的全过程，掌握科学的统计调查方法。
                    </p>
                    <div className="flex flex-col gap-3 pt-4">
                        <div className="flex items-center gap-3 text-slate-300">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            <span>真实场景模拟抽样过程</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-300">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            <span>可视化数据分析报表</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-300">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            <span>实时反馈与评估系统</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-sm text-slate-600">
                    © 2024 Virtual Sampling Lab. All rights reserved.
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="flex w-full items-center justify-center bg-slate-950 lg:w-1/2 px-4 sm:px-12">
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center lg:text-left">
                        <div className="flex justify-center lg:justify-start lg:hidden mb-6">
                            <div className="h-10 w-10 rounded-xl bg-indigo-500 shadow-lg shadow-indigo-500/30 flex items-center justify-center text-white">
                                <FlaskConical className="h-6 w-6" />
                            </div>
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight text-white">学生登录</h2>
                        <p className="mt-2 text-sm text-slate-400">
                            请输入您的学号和密码访问实验室。
                        </p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="studentId" className="text-slate-300">学号</Label>
                            <div className="relative">
                                <User className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                <Input
                                    id="studentId"
                                    className="pl-9 bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                                    placeholder="请输入您的学号"
                                    value={studentId}
                                    onChange={(e) => setStudentId(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password" className="text-slate-300">密码</Label>
                            </div>
                            <Input
                                id="password"
                                type="password"
                                className="bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:ring-indigo-500/20"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <div className="rounded-md bg-rose-900/20 p-3 text-sm text-rose-400 border border-rose-900/50">
                                {error}
                            </div>
                        )}

                        <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/25 h-10 transition-all" type="submit" disabled={isLoading}>
                            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
                            {isLoading ? "正在登录..." : "进入实验室"}
                        </Button>
                    </form>

                    <div className="mt-8 text-center text-sm text-slate-500">
                        <Link to="/admin" className="hover:text-indigo-400 transition-colors mx-2">管理员登录</Link>
                        <span>|</span>
                        <Link to="/teacher" className="hover:text-indigo-400 transition-colors mx-2">教师登录</Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
