import MuiPaper from "@mui/material/Paper";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertTriangle, BarChart3, Eye, EyeOff, Loader2 } from "lucide-react";

import { MaterialThemeProvider } from "@/components/MaterialThemeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_MODE } from "@/lib/demo-mode";
import { DEV_AUTH_MODE } from "@/lib/dev-mode";

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

const portalRoleTags: Record<AuthPortal, string> = {
    student: "学生实训端",
    teacher: "教师工作台",
    admin: "系统管理端",
};

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
    const capsLockId = `${portal}-login-capslock`;
    const [showPassword, setShowPassword] = useState(false);
    const [capsLockOn, setCapsLockOn] = useState(false);

    const handlePasswordKeyEvent = (event: KeyboardEvent<HTMLInputElement>) => {
        setCapsLockOn(event.getModifierState("CapsLock"));
    };

    const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
        setShowPassword(false);
        onSubmit(event);
    };

    const passwordDescribedBy = [
        error ? errorId : null,
        capsLockOn ? capsLockId : null,
    ].filter(Boolean).join(" ") || undefined;

    const showPrefillNotice = (DEMO_MODE || DEV_AUTH_MODE) && Boolean(username);

    return (
        <MaterialThemeProvider>
            <main className="flex min-h-screen flex-col items-center justify-center bg-muted px-6 py-8 font-sans text-foreground">
                <div className="w-full max-w-[28rem] space-y-4">
                    <MuiPaper
                        component="section"
                        elevation={0}
                        aria-label={heading}
                        className="rounded-overlay border border-border bg-card p-8 text-card-foreground shadow-none"
                    >
                        <div className="mb-6 space-y-3 text-center">
                            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-surface bg-primary-muted text-primary">
                                <BarChart3 className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <div className="space-y-1">
                                <div className="inline-flex items-center gap-2 text-meta font-medium text-muted-foreground">
                                    <span>商务统计虚拟仿真系统</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="text-primary">{portalRoleTags[portal]}</span>
                                </div>
                                <h1 className="text-page-title font-medium tracking-normal text-foreground">
                                    {heading}
                                </h1>
                                <p className="text-label text-muted-foreground">{description}</p>
                            </div>
                        </div>

                        {showPrefillNotice && (
                            <div className="mb-5 rounded-surface bg-muted px-3.5 py-2.5 text-meta text-muted-foreground">
                                当前环境已自动预填体验账号，可直接点击下方按钮进入工作台。
                            </div>
                        )}

                        <form onSubmit={handleFormSubmit} className="space-y-4">
                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="username" className="text-label font-medium text-foreground">
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
                                <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <Label htmlFor="password" className="text-label font-medium text-foreground">
                                            密码
                                        </Label>
                                        <span className="text-meta text-muted-foreground">{resetHint}</span>
                                    </div>
                                    <div className="relative">
                                        <Input
                                            id="password"
                                            data-testid={`${portal}-login-password`}
                                            type={showPassword ? "text" : "password"}
                                            placeholder="请输入密码"
                                            value={password}
                                            disabled={loading}
                                            onChange={(event) => onPasswordChange(event.target.value)}
                                            onKeyDown={handlePasswordKeyEvent}
                                            onKeyUp={handlePasswordKeyEvent}
                                            onBlur={() => setCapsLockOn(false)}
                                            aria-invalid={error ? true : undefined}
                                            aria-describedby={passwordDescribedBy}
                                            autoComplete="current-password"
                                            className="h-11 border-input bg-card pr-11"
                                        />
                                        <button
                                            type="button"
                                            data-testid={`${portal}-login-password-toggle`}
                                            aria-label={showPassword ? "隐藏密码" : "显示密码"}
                                            aria-pressed={showPassword}
                                            disabled={loading}
                                            onClick={() => setShowPassword((prev) => !prev)}
                                            className="absolute inset-y-1 right-1 inline-flex w-9 items-center justify-center rounded-circle text-muted-foreground outline-none transition-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            {showPassword ? (
                                                <EyeOff aria-hidden="true" className="h-4 w-4" />
                                            ) : (
                                                <Eye aria-hidden="true" className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                    {capsLockOn && (
                                        <div
                                            id={capsLockId}
                                            role="status"
                                            className="flex items-center gap-2 rounded-control border border-warning-border bg-warning-muted px-3 py-1.5 text-meta text-warning"
                                        >
                                            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
                                            <span>检测到已开启大写锁定（Caps Lock），请注意密码大小写</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {error && (
                                <div
                                    id={errorId}
                                    role="alert"
                                    aria-atomic="true"
                                    className="flex items-center gap-2.5 rounded-control border border-destructive-border bg-destructive-muted px-3 py-2.5 text-label text-destructive"
                                >
                                    <div aria-hidden="true" className="h-2 w-2 shrink-0 rounded-circle bg-destructive" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div className="space-y-4 pt-2">
                                <Button
                                    type="submit"
                                    size="lg"
                                    data-testid={`${portal}-login-submit`}
                                    className="h-11 w-full text-body font-medium"
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                                            {loadingText}
                                        </>
                                    ) : (
                                        "进入工作台"
                                    )}
                                </Button>

                                <div className="space-y-2.5 border-t border-border pt-4">
                                    <p className="text-center text-meta text-muted-foreground">切换其他角色入口</p>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {alternateLinks.map((link) => (
                                            <a
                                                key={link.href}
                                                href={link.href}
                                                className="inline-flex h-10 items-center justify-center rounded-pill border border-border bg-card px-4 text-label font-medium text-primary outline-none transition-none hover:border-primary-border hover:bg-primary-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            >
                                                {link.label}
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </form>
                    </MuiPaper>

                    <div className="flex items-center justify-between px-2 text-meta text-muted-foreground">
                        <span>商务统计与市场调研仿真平台</span>
                        <span>高校经管教学实训系统</span>
                    </div>
                </div>
            </main>
        </MaterialThemeProvider>
    );
}
