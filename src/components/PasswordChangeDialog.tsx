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
                        <Label htmlFor="currentPassword" className="text-foreground/90">当前密码</Label>
                        <Input
                            id="currentPassword"
                            type="password"
                            value={form.currentPassword}
                            onChange={(event) => onFieldChange("currentPassword", event.target.value)}
                            autoComplete="current-password"
                            data-testid={fieldTestIds?.currentPassword}
                            className="bg-background border-border text-foreground focus:border-ring"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="newPassword" className="text-foreground/90">新密码</Label>
                        <Input
                            id="newPassword"
                            type="password"
                            value={form.newPassword}
                            onChange={(event) => onFieldChange("newPassword", event.target.value)}
                            autoComplete="new-password"
                            data-testid={fieldTestIds?.newPassword}
                            className="bg-background border-border text-foreground focus:border-ring"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-foreground/90">确认新密码</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={form.confirmPassword}
                            onChange={(event) => onFieldChange("confirmPassword", event.target.value)}
                            autoComplete="new-password"
                            data-testid={fieldTestIds?.confirmPassword}
                            className="bg-background border-border text-foreground focus:border-ring"
                        />
                    </div>
                    {showPolicyHints && rules ? (
                        <div className="rounded-lg border border-border bg-background/60 p-3 text-xs space-y-1.5">
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
                    {error ? <div className="text-sm text-destructive bg-destructive/20 p-2 rounded">{error}</div> : null}
                </div>
                <DialogFooter>
                    {allowClose ? (
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                            取消
                        </Button>
                    ) : null}
                    <Button onClick={onSubmit} disabled={saving} className="bg-primary hover:bg-primary text-primary-foreground" data-testid={submitTestId}>
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {submitLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
