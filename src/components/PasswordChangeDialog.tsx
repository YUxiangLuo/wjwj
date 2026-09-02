import { useId } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PasswordFormState } from "@/hooks/usePasswordChange";
import type { PasswordRuleResult } from "@/lib/password-policy";

interface PasswordChangeDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    allowClose: boolean;
    title: string;
    description: string;
    form: PasswordFormState;
    onFieldChange: (field: keyof PasswordFormState, value: string) => void;
    error: string | null;
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
    const {
        open,
        onOpenChange,
        allowClose,
        title,
        description,
        form,
        onFieldChange,
        error,
        saving,
        onSubmit,
        submitLabel,
        submitTestId,
        fieldTestIds,
        showPolicyHints = false,
        policyMinLength = 8,
        rules,
        forbiddenHintLabel,
    } = props;

    return (
        <Dialog open={open} onOpenChange={(nextOpen) => {
            if (!allowClose && !nextOpen) return;
            onOpenChange(nextOpen);
        }}>
            <DialogContent className="bg-card border-border text-foreground" showCloseButton={allowClose}>
                <DialogHeader>
                    <DialogTitle className="text-foreground">{title}</DialogTitle>
                    <DialogDescription className="text-muted-foreground">{description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor={currentPasswordId} className="text-foreground">当前密码</Label>
                        <Input
                            id={currentPasswordId}
                            type="password"
                            value={form.currentPassword}
                            onChange={(event) => onFieldChange("currentPassword", event.target.value)}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId : undefined}
                            autoComplete="current-password"
                            data-testid={fieldTestIds?.currentPassword}
                            className="bg-card border-input text-foreground focus:border-ring"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={newPasswordId} className="text-foreground">新密码</Label>
                        <Input
                            id={newPasswordId}
                            type="password"
                            value={form.newPassword}
                            onChange={(event) => onFieldChange("newPassword", event.target.value)}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId : undefined}
                            autoComplete="new-password"
                            data-testid={fieldTestIds?.newPassword}
                            className="bg-card border-input text-foreground focus:border-ring"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={confirmPasswordId} className="text-foreground">确认新密码</Label>
                        <Input
                            id={confirmPasswordId}
                            type="password"
                            value={form.confirmPassword}
                            onChange={(event) => onFieldChange("confirmPassword", event.target.value)}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId : undefined}
                            autoComplete="new-password"
                            data-testid={fieldTestIds?.confirmPassword}
                            className="bg-card border-input text-foreground focus:border-ring"
                        />
                    </div>
                    {showPolicyHints && rules ? (
                        <div className="rounded-surface border border-border bg-background p-3 text-meta space-y-1.5">
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>密码强度</span>
                                <span className={getStrengthToneClassName(rules.score)}>{rules.strengthLabel}</span>
                            </div>
                            <div className={rules.minLength ? "text-success" : "text-muted-foreground"}>{rules.minLength ? "✓" : "✗"} 至少{policyMinLength}个字符</div>
                            <div className={rules.hasLetter ? "text-success" : "text-muted-foreground"}>{rules.hasLetter ? "✓" : "✗"} 包含字母</div>
                            <div className={rules.hasNumber ? "text-success" : "text-muted-foreground"}>{rules.hasNumber ? "✓" : "✗"} 包含数字</div>
                            <div className={rules.hasSpecial ? "text-success" : "text-muted-foreground"}>{rules.hasSpecial ? "✓" : "✗"} 包含特殊字符</div>
                            <div className={rules.noForbiddenSubstring ? "text-success" : "text-muted-foreground"}>{rules.noForbiddenSubstring ? "✓" : "✗"} 不包含{forbiddenHintLabel ?? "账号信息"}</div>
                            <div className={rules.matched ? "text-success" : "text-muted-foreground"}>{rules.matched ? "✓" : "✗"} 两次密码一致</div>
                        </div>
                    ) : null}
                    {error ? <div id={errorId} role="alert" aria-atomic="true" className="text-label text-destructive bg-destructive-muted p-2 rounded-control">{error}</div> : null}
                </div>
                <DialogFooter>
                    {allowClose ? (
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                    ) : null}
                    <Button onClick={onSubmit} disabled={saving} aria-busy={saving} className="bg-primary hover:bg-primary-hover text-primary-foreground" data-testid={submitTestId}>
                        {saving ? <Loader2 aria-hidden="true" className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {submitLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
