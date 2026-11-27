import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PasswordChangeField, PasswordFormState } from "@/hooks/usePasswordChange";
import { evaluatePasswordRules, type PasswordRuleResult } from "@/lib/password-policy";

interface PasswordChangeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    form: PasswordFormState;
    onFieldChange: (field: keyof PasswordFormState, value: string) => void;
    error: string | null;
    /** Fields the current error belongs to; defaults to all three for legacy callers. */
    errorFields?: PasswordChangeField[];
    saving: boolean;
    onSubmit: () => void | Promise<unknown>;
    submitLabel: string;
    submitTestId?: string;
    fieldTestIds?: Partial<Record<keyof PasswordFormState, string>>;
    showPolicyHints?: boolean;
    policyMinLength?: number;
    rules?: PasswordRuleResult;
    forbiddenHintLabel?: string;
}

function getStrengthToneClassName(score: number) {
    if (score <= 2) return "text-destructive";
    if (score <= 4) return "text-warning";
    return "text-success";
}

export function PasswordChangeDialog(props: PasswordChangeDialogProps) {
    const idPrefix = useId();
    const currentPasswordId = `${idPrefix}-current-password`;
    const newPasswordId = `${idPrefix}-new-password`;
    const confirmPasswordId = `${idPrefix}-confirm-password`;
    const errorId = `${idPrefix}-error`;
    const capsLockId = `${idPrefix}-capslock`;
    const {
        open,
        onOpenChange,
        title,
        description,
        form,
        onFieldChange,
        error,
        errorFields,
        saving,
        onSubmit,
        submitLabel,
        submitTestId,
        fieldTestIds,
        showPolicyHints = true,
        policyMinLength = 8,
        rules,
        forbiddenHintLabel,
    } = props;

    const [showPasswords, setShowPasswords] = useState(false);
    const [capsLockOn, setCapsLockOn] = useState(false);

    useEffect(() => {
        if (!open) {
            setShowPasswords(false);
            setCapsLockOn(false);
        }
    }, [open]);

    const effectiveRules = useMemo<PasswordRuleResult>(() => (
        rules ?? evaluatePasswordRules({
            password: form.newPassword,
            confirmPassword: form.confirmPassword,
            minLength: policyMinLength,
        })
    ), [form.confirmPassword, form.newPassword, policyMinLength, rules]);

    const handleKeyEvent = (event: KeyboardEvent<HTMLInputElement>) => {
        setCapsLockOn(event.getModifierState("CapsLock"));
    };

    const fields = errorFields ?? ["currentPassword", "newPassword", "confirmPassword"];
    const invalidFields = new Set(error ? fields : []);
    const inputType = showPasswords ? "text" : "password";

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen); }}>
            <DialogContent className="border-border bg-card text-foreground" showCloseButton={!saving}>
                <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); setShowPasswords(false); void onSubmit(); }}>
                    <DialogHeader>
                        <DialogTitle className="text-foreground">{title}</DialogTitle>
                        <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3.5 py-1">
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <Label htmlFor={currentPasswordId} className="text-foreground">当前密码</Label>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    aria-pressed={showPasswords}
                                    disabled={saving}
                                    onClick={() => setShowPasswords((prev) => !prev)}
                                    className="h-7 px-2.5"
                                >
                                    {showPasswords ? <EyeOff aria-hidden="true" className="h-3.5 w-3.5" /> : <Eye aria-hidden="true" className="h-3.5 w-3.5" />}
                                    <span>{showPasswords ? "隐藏密码" : "显示密码"}</span>
                                </Button>
                            </div>
                            <Input
                                id={currentPasswordId}
                                type={inputType}
                                value={form.currentPassword}
                                disabled={saving}
                                onChange={(event) => onFieldChange("currentPassword", event.target.value)}
                                onKeyDown={handleKeyEvent}
                                onKeyUp={handleKeyEvent}
                                onBlur={() => setCapsLockOn(false)}
                                aria-invalid={invalidFields.has("currentPassword") ? true : undefined}
                                aria-describedby={error ? errorId : undefined}
                                autoComplete="current-password"
                                data-testid={fieldTestIds?.currentPassword}
                                className="border-input bg-card text-foreground focus:border-ring"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={newPasswordId} className="text-foreground">新密码</Label>
                            <Input
                                id={newPasswordId}
                                type={inputType}
                                value={form.newPassword}
                                disabled={saving}
                                onChange={(event) => onFieldChange("newPassword", event.target.value)}
                                onKeyDown={handleKeyEvent}
                                onKeyUp={handleKeyEvent}
                                onBlur={() => setCapsLockOn(false)}
                                aria-invalid={invalidFields.has("newPassword") ? true : undefined}
                                aria-describedby={error ? errorId : undefined}
                                autoComplete="new-password"
                                data-testid={fieldTestIds?.newPassword}
                                className="border-input bg-card text-foreground focus:border-ring"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor={confirmPasswordId} className="text-foreground">确认新密码</Label>
                            <Input
                                id={confirmPasswordId}
                                type={inputType}
                                value={form.confirmPassword}
                                disabled={saving}
                                onChange={(event) => onFieldChange("confirmPassword", event.target.value)}
                                onKeyDown={handleKeyEvent}
                                onKeyUp={handleKeyEvent}
                                onBlur={() => setCapsLockOn(false)}
                                aria-invalid={invalidFields.has("confirmPassword") ? true : undefined}
                                aria-describedby={error ? errorId : undefined}
                                autoComplete="new-password"
                                data-testid={fieldTestIds?.confirmPassword}
                                className="border-input bg-card text-foreground focus:border-ring"
                            />
                        </div>
                        {capsLockOn ? (
                            <div id={capsLockId} role="status" className="flex items-center gap-2 rounded-control border border-warning-border bg-warning-muted px-2.5 py-1.5 text-meta text-warning">
                                <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
                                <span>检测到已开启大写锁定（Caps Lock），请注意密码大小写</span>
                            </div>
                        ) : null}
                        {showPolicyHints ? (
                            <div className="space-y-1.5 rounded-surface border border-border bg-muted p-3 text-meta">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span>密码强度</span>
                                    <span className={getStrengthToneClassName(effectiveRules.score)}>{effectiveRules.strengthLabel}</span>
                                </div>
                                <div className={effectiveRules.minLength ? "text-success" : "text-muted-foreground"}>{effectiveRules.minLength ? "✓" : "✗"} 至少{policyMinLength}个字符</div>
                                <div className={effectiveRules.hasLetter ? "text-success" : "text-muted-foreground"}>{effectiveRules.hasLetter ? "✓" : "✗"} 包含字母</div>
                                <div className={effectiveRules.hasNumber ? "text-success" : "text-muted-foreground"}>{effectiveRules.hasNumber ? "✓" : "✗"} 包含数字</div>
                                <div className={effectiveRules.hasSpecial ? "text-success" : "text-muted-foreground"}>{effectiveRules.hasSpecial ? "✓" : "✗"} 包含特殊字符</div>
                                {rules ? (
                                    <div className={rules.noForbiddenSubstring ? "text-success" : "text-muted-foreground"}>{rules.noForbiddenSubstring ? "✓" : "✗"} 不包含{forbiddenHintLabel ?? "账号信息"}</div>
                                ) : (
                                    <div className="text-muted-foreground">• 请勿包含{forbiddenHintLabel ?? "账号信息"}，且不能与当前密码相同</div>
                                )}
                                <div className={effectiveRules.matched ? "text-success" : "text-muted-foreground"}>{effectiveRules.matched ? "✓" : "✗"} 两次密码一致</div>
                            </div>
                        ) : null}
                        {error ? (
                            <div id={errorId} role="alert" aria-atomic="true" className="rounded-control border border-destructive-border bg-destructive-muted p-2.5 text-label text-destructive">
                                {error}
                            </div>
                        ) : null}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                            取消
                        </Button>
                        <Button type="submit" disabled={saving} aria-busy={saving} data-testid={submitTestId}>
                            {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
                            {submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
