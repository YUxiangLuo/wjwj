import type { FormEvent } from "react";
import { BarChart3, HelpCircle, LineChart, Loader2, Lock, PieChart, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AuthPortal = "student" | "teacher" | "admin";

export interface AuthLoginScreenProps {
    portal: AuthPortal;
    heading: string;
    description: string;
    accountLabel: string;
    accountPlaceholder: string;
    resetHint: string;
    username: string;
    password: string;
    loading: boolean;
    error: string | null;
    alternateLinks: readonly { href: string; label: string }[];
    onUsernameChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const featureItems = [
    { icon: LineChart, label: "实时可视化", intent: "text-primary" },
    { icon: PieChart, label: "动态交互", intent: "text-info" },
    { icon: ShieldCheck, label: "精准评估", intent: "text-success" },
] as const;

export function AuthLoginScreen({
    portal,
    heading,
    description,
    accountLabel,
    accountPlaceholder,
    resetHint,
    username,
    password,
    loading,
    error,
    alternateLinks,
    onUsernameChange,
    onPasswordChange,
    onSubmit,
}: AuthLoginScreenProps) {
    const errorId = `${portal}-login-error`;

    return (
        <main className="grid min-h-screen grid-cols-2 bg-background font-sans text-foreground">
            <div className="relative flex flex-col justify-between overflow-hidden border-r border-border bg-card p-12">
                <div className="absolute inset-0 z-0 opacity-40">
                    <div className="absolute inset-0 z-10 bg-gradient-to-br from-primary/40 via-card to-background" />
                    <div className="absolute left-0 top-0 h-full w-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-card/5 to-transparent" />
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--decorative-grid)_1px,transparent_1px),linear-gradient(to_bottom,var(--decorative-grid)_1px,transparent_1px)] bg-[size:24px_24px]" />
                </div>

                <div className="relative z-20 flex items-center gap-3 text-xl font-semibold tracking-tight text-foreground">
                    <div className="rounded-surface bg-primary p-2 shadow-emphasis">
                        <BarChart3 className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <span className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
                        统计学虚拟仿真实验平台
                    </span>
                </div>

                <div className="relative z-20 flex max-w-lg flex-1 flex-col justify-center">
                    <div className="relative">
                        <div className="absolute -left-10 -top-10 h-24 w-24 rounded-full bg-primary/30 blur-3xl" />
                        <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-info/20 blur-3xl" />
                        <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight text-foreground">
                            探索数据背后的<br />
                            <span className="text-primary">数学真理</span>
                        </h1>
                    </div>

                    <p className="max-w-md text-lg font-light leading-relaxed text-muted-foreground">
                        通过沉浸式虚拟仿真实验，完成问卷设计、样本量规划、概率抽样与估计比较。
                    </p>

                    <div className="mt-12 flex gap-8">
                        {featureItems.map(({ icon: Icon, label, intent }) => (
                            <div key={label} className="flex flex-col gap-2">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-feature border border-input bg-muted/50 shadow-surface ${intent}`}>
                                    <Icon className="h-6 w-6" />
                                </div>
                                <span className="text-sm font-medium text-foreground/90">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative z-20 text-sm text-muted-foreground">
                    © 2026 Sampling Simulation System. All rights reserved.
                </div>
            </div>

            <div className="relative flex flex-col items-center justify-center bg-background p-8">
                <div className="w-full max-w-md space-y-10">
                    <div className="flex flex-col space-y-3 text-center">
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">{heading}</h2>
                        <p className="text-base text-muted-foreground">{description}</p>
                    </div>

                    <form onSubmit={onSubmit} className="space-y-6">
                        <div className="space-y-5">
                            <div className="space-y-2.5">
                                <Label htmlFor="username" className="ml-1 text-sm font-medium text-foreground/90">
                                    {accountLabel}
                                </Label>
                                <Input
                                    id="username"
                                    data-testid={`${portal}-login-username`}
                                    placeholder={accountPlaceholder}
                                    value={username}
                                    onChange={(event) => onUsernameChange(event.target.value)}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={error ? errorId : undefined}
                                    autoComplete="username"
                                    className="h-12 rounded-control border-border bg-card text-foreground transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-ring/20"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <div className="ml-1 flex items-center justify-between">
                                    <Label htmlFor="password" className="text-sm font-medium text-foreground/90">密码</Label>
                                    <span className="text-xs font-medium text-primary">{resetHint}</span>
                                </div>
                                <Input
                                    id="password"
                                    data-testid={`${portal}-login-password`}
                                    type="password"
                                    placeholder="请输入密码"
                                    value={password}
                                    onChange={(event) => onPasswordChange(event.target.value)}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={error ? errorId : undefined}
                                    autoComplete="current-password"
                                    className="h-12 rounded-control border-border bg-card text-foreground transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-ring/20"
                                />
                            </div>
                        </div>

                        {error && (
                            <div id={errorId} role="alert" aria-atomic="true" className="flex items-center gap-3 rounded-surface border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive animate-in slide-in-from-top-2">
                                <div aria-hidden="true" className="h-2 w-2 rounded-full bg-destructive" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-4 pt-2">
                            <Button
                                type="submit"
                                data-testid={`${portal}-login-submit`}
                                className="h-12 w-full rounded-control bg-primary text-base font-medium text-primary-foreground shadow-emphasis transition-all hover:scale-[1.02] hover:bg-primary/90 active:scale-[0.98]"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                                        登录中...
                                    </>
                                ) : "安全登录"}
                            </Button>
                            <div className="space-y-3 rounded-feature border border-border bg-card/80 p-4">
                                <p className="text-center text-xs font-medium tracking-[0.2em] text-muted-foreground">其他端入口</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {alternateLinks.map((link) => (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            className="inline-flex h-11 items-center justify-center rounded-control border border-border bg-background text-sm font-medium text-foreground/90 transition-all hover:border-primary hover:text-primary"
                                        >
                                            {link.label}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </form>

                    <div className="flex justify-center gap-8 text-sm text-muted-foreground">
                        <span className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-foreground/90">
                            <HelpCircle className="h-4 w-4" />
                            使用指南
                        </span>
                        <span className="flex cursor-pointer items-center gap-1.5 transition-colors hover:text-foreground/90">
                            <Lock className="h-4 w-4" />
                            隐私政策
                        </span>
                    </div>
                </div>
            </div>
        </main>
    );
}
