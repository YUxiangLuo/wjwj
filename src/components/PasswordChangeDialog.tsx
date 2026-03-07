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
    onSubmit: () => void | Promise<void>;
    submitLabel: string;
    submitTestId?: string;
    fieldTestIds?: Partial<Record<keyof PasswordFormState, string>>;
    showPolicyHints?: boolean;
    policyMinLength?: number;
    rules?: PasswordRuleResult;
    forbiddenHintLabel?: string;
}

function getStrengthToneClassName(score: number) {
    if (score <= 2) return "text-rose-600";
    if (score <= 4) return "text-amber-600";
    return "text-emerald-600";
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
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-slate-100">{title}</DialogTitle>
                    <DialogDescription className="text-slate-400">{description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword" className="text-slate-300">当前密码</Label>
                        <Input
                            id="currentPassword"
                            type="password"
                            value={form.currentPassword}
                            onChange={(event) => onFieldChange("currentPassword", event.target.value)}
                            autoComplete="current-password"
                            data-testid={fieldTestIds?.currentPassword}
                            className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="newPassword" className="text-slate-300">新密码</Label>
                        <Input
                            id="newPassword"
                            type="password"
                            value={form.newPassword}
                            onChange={(event) => onFieldChange("newPassword", event.target.value)}
                            autoComplete="new-password"
                            data-testid={fieldTestIds?.newPassword}
                            className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-slate-300">确认新密码</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={form.confirmPassword}
                            onChange={(event) => onFieldChange("confirmPassword", event.target.value)}
                            autoComplete="new-password"
                            data-testid={fieldTestIds?.confirmPassword}
                            className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500"
                        />
                    </div>
                    {showPolicyHints && rules ? (
                        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-1.5">
                            <div className="flex items-center justify-between text-slate-400">
                                <span>密码强度</span>
                                <span className={getStrengthToneClassName(rules.score)}>{rules.strengthLabel}</span>
                            </div>
                            <div className={rules.minLength ? "text-emerald-600" : "text-slate-500"}>{rules.minLength ? "✓" : "✗"} 至少{policyMinLength}个字符</div>
                            <div className={rules.hasLetter ? "text-emerald-600" : "text-slate-500"}>{rules.hasLetter ? "✓" : "✗"} 包含字母</div>
                            <div className={rules.hasNumber ? "text-emerald-600" : "text-slate-500"}>{rules.hasNumber ? "✓" : "✗"} 包含数字</div>
                            <div className={rules.hasSpecial ? "text-emerald-600" : "text-slate-500"}>{rules.hasSpecial ? "✓" : "✗"} 包含特殊字符</div>
                            <div className={rules.noForbiddenSubstring ? "text-emerald-600" : "text-slate-500"}>{rules.noForbiddenSubstring ? "✓" : "✗"} 不包含{forbiddenHintLabel ?? "账号信息"}</div>
                            <div className={rules.matched ? "text-emerald-600" : "text-slate-500"}>{rules.matched ? "✓" : "✗"} 两次密码一致</div>
                        </div>
                    ) : null}
                    {error ? <div className="text-sm text-rose-600 bg-rose-900/20 p-2 rounded">{error}</div> : null}
                </div>
                <DialogFooter>
                    {allowClose ? (
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="text-slate-400 hover:text-slate-100 hover:bg-slate-800">
                            取消
                        </Button>
                    ) : null}
                    <Button onClick={onSubmit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white" data-testid={submitTestId}>
                        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        {submitLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
