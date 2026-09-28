import type { FormEvent } from "react";
import { BarChart3, LineChart, Loader2, PieChart, ShieldCheck } from "lucide-react";

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
    loadingText?: string;
    error: string | null;
    alternateLinks: readonly { href: string; label: string }[];
    onUsernameChange: (value: string) => void;
    onPasswordChange: (value: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const featureItems = [
    { icon: LineChart, label: "样本量规划" },
    { icon: PieChart, label: "概率抽样" },
    { icon: ShieldCheck, label: "估计比较" },
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
    loadingText = "登录中...",
    error,
    alternateLinks,
    onUsernameChange,
    onPasswordChange,
    onSubmit,
}: AuthLoginScreenProps) {
    const errorId = `${portal}-login-error`;

    return (
        <main className="grid min-h-screen grid-cols-[44%_56%] bg-background font-sans text-foreground">
            <div className="relative flex flex-col justify-between overflow-hidden border-r border-navigation-border bg-navigation p-12 text-navigation-foreground">
                <div aria-hidden="true" className="institutional-grid absolute inset-0" />

                <div className="relative z-20 flex items-center gap-3 text-section-title font-semibold tracking-tight text-navigation-foreground">
                    <div className="rounded-control border border-navigation-border bg-navigation-active p-2">
                        <BarChart3 className="h-6 w-6 text-navigation-active-foreground" />
                    </div>
                    <span>统计学虚拟仿真实验平台</span>
                </div>

                <div className="relative z-20 flex max-w-lg flex-1 flex-col justify-center">
                    <h1 className="mb-6 text-display font-bold tracking-tight text-navigation-foreground">
                        抽样与估计<br />
                        <span className="text-navigation-muted">虚拟仿真实验</span>
                    </h1>

                    <p className="max-w-md text-body text-navigation-muted">
                        设计问卷、规划样本量，比较不同抽样方法的估计结果。
                    </p>

                    <div className="mt-12 flex gap-8">
                        {featureItems.map(({ icon: Icon, label }) => (
                            <div key={label} className="flex flex-col gap-2">
                                <div className="flex h-11 w-11 items-center justify-center rounded-control border border-navigation-border bg-navigation-active text-navigation-active-foreground">
                                    <Icon className="h-6 w-6" />
                                </div>
                                <span className="text-label font-medium text-navigation-foreground">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative z-20 text-meta text-navigation-muted">
                    © 2026 Sampling Simulation System. All rights reserved.
                </div>
            </div>

            <div className="relative flex flex-col items-center justify-center bg-card p-8">
                <div className="w-full max-w-md space-y-8">
                    <div className="flex flex-col space-y-3 text-center">
                        <h2 className="text-page-title font-semibold tracking-tight text-foreground">{heading}</h2>
                        <p className="text-body text-muted-foreground">{description}</p>
                    </div>

                    <form onSubmit={onSubmit} className="space-y-6">
                        <div className="space-y-5">
                            <div className="space-y-2.5">
                                <Label htmlFor="username" className="ml-1 text-label font-medium text-foreground">
                                    {accountLabel}
                                </Label>
                                <Input
                                    id="username"
                                    data-testid={`${portal}-login-username`}
                                    placeholder={accountPlaceholder}
                                    value={username}
                                    disabled={loading}
                                    onChange={(event) => onUsernameChange(event.target.value)}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={error ? errorId : undefined}
                                    autoComplete="username"
                                    className="h-11 border-input bg-card"
                                />
                            </div>
                            <div className="space-y-2.5">
                                <div className="ml-1 flex items-center justify-between">
                                    <Label htmlFor="password" className="text-label font-medium text-foreground">密码</Label>
                                    <span className="text-meta font-medium text-primary">{resetHint}</span>
                                </div>
                                <Input
                                    id="password"
                                    data-testid={`${portal}-login-password`}
                                    type="password"
                                    placeholder="请输入密码"
                                    value={password}
                                    disabled={loading}
                                    onChange={(event) => onPasswordChange(event.target.value)}
                                    aria-invalid={error ? true : undefined}
                                    aria-describedby={error ? errorId : undefined}
                                    autoComplete="current-password"
                                    className="h-11 border-input bg-card"
                                />
                            </div>
                        </div>

                        {error && (
                            <div id={errorId} role="alert" aria-atomic="true" className="flex items-center gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-4 text-label text-destructive animate-in slide-in-from-top-2">
                                <div aria-hidden="true" className="h-2 w-2 rounded-circle bg-destructive" />
                                {error}
                            </div>
                        )}

                        <div className="space-y-4 pt-2">
                            <Button
                                type="submit"
                                data-testid={`${portal}-login-submit`}
                                className="h-11 w-full text-body"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                                        {loadingText}
                                    </>
                                ) : "登录"}
                            </Button>
                            <div className="space-y-3 rounded-surface border border-border bg-secondary p-4">
                                <p className="text-center text-meta font-medium tracking-[0.2em] text-muted-foreground">其他端入口</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {alternateLinks.map((link) => (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            className="inline-flex h-10 items-center justify-center rounded-control border border-input bg-card text-label font-medium text-foreground transition-none hover:border-primary hover:bg-primary-muted hover:text-primary"
                                        >
                                            {link.label}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </form>


                </div>
            </div>
        </main>
    );
}
