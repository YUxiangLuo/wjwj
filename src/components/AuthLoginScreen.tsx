import { useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Eye, EyeOff, Filter, Loader2, RefreshCw, TrendingUp } from "lucide-react";

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

const workflowPillars = [
    { icon: BarChart3, label: "商业立项与问卷绑定", detail: "指标对标总体词典" },
    { icon: Filter, label: "试投回收与废卷质检", detail: "剔除闪电与直线卷" },
    { icon: RefreshCw, label: "抽样配额迭代调优", detail: "校正低响应客群偏差" },
    { icon: TrendingUp, label: "量化估计与管理决策", detail: "支撑定价与运营配置" },
] as const;

const portalBadgeLabels: Record<AuthPortal, string> = {
    student: "STUDENT ANALYST PORTAL",
    teacher: "INSTRUCTOR STUDIO",
    admin: "SYSTEM CONSOLE",
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

    return (
        <main className="grid min-h-screen grid-cols-[50%_50%] bg-background font-sans text-foreground">
            <div className="relative flex flex-col justify-between overflow-hidden border-r border-navigation-border bg-navigation px-7 py-6 text-navigation-foreground">
                <div aria-hidden="true" className="institutional-grid absolute inset-0" />

                <div className="relative z-20 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 text-subheading font-semibold tracking-tight text-navigation-foreground">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-navigation-border bg-navigation-active text-navigation-active-foreground">
                            <BarChart3 className="h-5 w-5" />
                        </div>
                        <div>
                            <span className="block text-subheading font-semibold leading-tight text-navigation-foreground">商务统计虚拟仿真系统</span>
                            <span className="block text-meta text-navigation-muted">Business Statistics &amp; Survey Simulation Studio</span>
                        </div>
                    </div>
                </div>

                <div className="relative z-20 my-3 flex flex-col justify-center space-y-4">
                    <div className="space-y-2.5">
                        <span className="inline-flex items-center gap-2 rounded-control border border-navigation-border bg-navigation-hover px-3 py-1 text-meta font-medium text-navigation-muted">
                            <CheckCircle2 className="h-4 w-4 text-navigation-foreground" />
                            全闭环商业市场调研与抽样决策实训
                        </span>
                        <h1 className="text-display font-bold tracking-tight text-navigation-foreground">
                            从首轮试投质检<br />
                            <span className="text-navigation-muted">到稳健商业决策闭环</span>
                        </h1>
                        <p className="max-w-xl text-label text-navigation-muted">
                            真实演练商业问卷设计、首轮试投发放、异常废卷清洗、无回答偏倚诊断与二轮自适应抽样调优，用高质量样本数据支撑定价、留存与容量管理决策。
                        </p>
                    </div>

                    {/* Executive Simulation Sandbox Preview Card */}
                    <div aria-hidden="true" className="rounded-surface border border-navigation-border bg-navigation-hover p-3.5">
                        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-navigation-border pb-2">
                            <span className="truncate text-meta font-semibold text-navigation-foreground">商业调研演进沙盘 · Wave 1 → Wave 2</span>
                            <span className="shrink-0 whitespace-nowrap rounded-control border border-navigation-border bg-navigation-active px-2 py-0.5 text-meta tabular-nums text-navigation-active-foreground">
                                有效样本达标 100%
                            </span>
                        </div>
                        <svg viewBox="0 0 460 112" className="h-24 w-full" role="presentation">
                            <rect x="0" y="10" width="138" height="92" rx="8" fill="var(--navigation)" stroke="var(--navigation-border)" />
                            <text x="12" y="30" fill="var(--navigation-muted)" fontSize="12">Wave 1 首轮试投漏斗</text>
                            <rect x="12" y="42" width="110" height="10" rx="4" fill="var(--chart-2)" />
                            <rect x="12" y="58" width="76" height="10" rx="4" fill="var(--chart-3)" />
                            <rect x="12" y="74" width="54" height="10" rx="4" fill="var(--chart-5)" />
                            <text x="12" y="96" fill="var(--navigation-foreground)" fontSize="12">有效率 58% · 需补量</text>

                            <line x1="146" y1="56" x2="164" y2="56" stroke="var(--navigation-muted)" strokeWidth="2" />
                            <polygon points="164,56 158,52 158,60" fill="var(--navigation-muted)" />

                            <rect x="170" y="10" width="134" height="92" rx="8" fill="var(--navigation)" stroke="var(--navigation-border)" />
                            <text x="182" y="30" fill="var(--navigation-muted)" fontSize="12">质检清洗与配额调优</text>
                            <text x="182" y="52" fill="var(--navigation-foreground)" fontSize="12">• 剔除闪电敷衍废卷</text>
                            <text x="182" y="71" fill="var(--navigation-foreground)" fontSize="12">• 高价值客群分层补抽</text>
                            <text x="182" y="90" fill="var(--navigation-foreground)" fontSize="12">• 实测方差重算样本量</text>

                            <line x1="312" y1="56" x2="330" y2="56" stroke="var(--navigation-muted)" strokeWidth="2" />
                            <polygon points="330,56 324,52 324,60" fill="var(--navigation-muted)" />

                            <rect x="336" y="10" width="124" height="92" rx="8" fill="var(--navigation-active)" stroke="var(--navigation-border)" />
                            <text x="348" y="30" fill="var(--navigation-muted)" fontSize="12">Wave 2 决策估计</text>
                            <line x1="398" y1="42" x2="398" y2="82" stroke="var(--navigation-muted)" strokeDasharray="3 3" />
                            <line x1="358" y1="54" x2="436" y2="54" stroke="var(--chart-5)" strokeWidth="2.5" />
                            <circle cx="382" cy="54" r="4" fill="var(--chart-5)" />
                            <line x1="380" y1="72" x2="416" y2="72" stroke="var(--navigation-foreground)" strokeWidth="2.5" />
                            <circle cx="399" cy="72" r="4.5" fill="var(--navigation-foreground)" />
                            <text x="348" y="96" fill="var(--navigation-foreground)" fontSize="12">误差半宽收敛 38%</text>
                        </svg>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                        {workflowPillars.map(({ icon: Icon, label, detail }) => (
                            <div key={label} className="flex items-start gap-2.5 rounded-surface border border-navigation-border bg-navigation-hover px-3 py-2.5">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-navigation-border bg-navigation-active text-navigation-active-foreground">
                                    <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <span className="block whitespace-nowrap text-label font-semibold text-navigation-foreground">{label}</span>
                                    <span className="block text-meta text-navigation-muted">{detail}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative z-20 flex items-center justify-between gap-3 text-meta text-navigation-muted">
                    <span className="truncate">© 2026 Business Statistics Studio</span>
                    <span className="shrink-0">高校经管与商务统计实训系统</span>
                </div>
            </div>

            <div className="relative flex flex-col items-center justify-center bg-background px-7 py-6">
                <div className="w-full max-w-md rounded-surface border border-border bg-card p-7">
                    <div className="mb-5 space-y-1.5 border-b border-border pb-4">
                        <span className="inline-block rounded-control border border-primary-border bg-primary-muted px-2.5 py-0.5 text-meta font-semibold tracking-wider text-primary">
                            {portalBadgeLabels[portal]}
                        </span>
                        <h2 className="text-page-title font-bold tracking-tight text-foreground">{heading}</h2>
                        <p className="text-label text-muted-foreground">{description}</p>
                    </div>

                    <form onSubmit={handleFormSubmit} className="space-y-4">
                        <div className="space-y-3.5">
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
                                    <Label htmlFor="password" className="text-label font-medium text-foreground">密码</Label>
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
                                        className="h-11 border-input bg-card pr-10"
                                    />
                                    <button
                                        type="button"
                                        data-testid={`${portal}-login-password-toggle`}
                                        aria-label={showPassword ? "隐藏密码" : "显示密码"}
                                        aria-pressed={showPassword}
                                        disabled={loading}
                                        onClick={() => setShowPassword((prev) => !prev)}
                                        className="absolute inset-y-1 right-1 inline-flex w-9 items-center justify-center rounded-control text-muted-foreground outline-none transition-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        {showPassword ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
                                    </button>
                                </div>
                                {capsLockOn && (
                                    <div id={capsLockId} role="status" className="flex items-center gap-2 rounded-control border border-warning-border bg-warning-muted px-2.5 py-1.5 text-meta text-warning">
                                        <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
                                        <span>检测到已开启大写锁定（Caps Lock），请注意密码大小写</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {error && (
                            <div id={errorId} role="alert" aria-atomic="true" className="flex items-center gap-3 rounded-surface border border-destructive-border bg-destructive-muted p-3 text-label text-destructive">
                                <div aria-hidden="true" className="h-2 w-2 shrink-0 rounded-circle bg-destructive" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-4 pt-1">
                            <Button
                                type="submit"
                                data-testid={`${portal}-login-submit`}
                                className="h-11 w-full text-body font-semibold"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                                        {loadingText}
                                    </>
                                ) : "进入工作台"}
                            </Button>

                            <div className="space-y-2 border-t border-border pt-3.5">
                                <p className="text-center text-meta font-medium text-muted-foreground">切换其他角色门户</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {alternateLinks.map((link) => (
                                        <a
                                            key={link.href}
                                            href={link.href}
                                            className="inline-flex h-10 items-center justify-center rounded-control border border-border bg-secondary text-label font-medium text-secondary-foreground outline-none transition-none hover:border-primary-border hover:bg-primary-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
