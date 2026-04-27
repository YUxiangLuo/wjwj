import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, User, Key, Shield, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STUDENT_PASSWORD_POLICY, evaluatePasswordRules } from "@/lib/password-policy";
import { authApi } from "../api-client";
import { useStudent } from "../contexts/StudentContext";
import { cn } from "@/lib/utils";

function getRuleClass(passed: boolean) {
    return passed ? "text-primary" : "text-muted-foreground";
}

function getStrengthClass(score: number) {
    if (score <= 2) return "text-destructive";
    if (score <= 4) return "text-muted-foreground";
    return "text-primary";
}

export function Profile() {
    const navigate = useNavigate();
    const { currentUser, refreshUser } = useStudent();
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const passwordPolicy = evaluatePasswordRules({
        password: passwordForm.newPassword,
        confirmPassword: passwordForm.confirmPassword,
        minLength: STUDENT_PASSWORD_POLICY.minLength,
        forbiddenSubstrings: [currentUser?.studentId],
    });
    const passwordRules = {
        minLength: passwordPolicy.minLength,
        hasLetter: passwordPolicy.hasLetter,
        hasNumber: passwordPolicy.hasNumber,
        hasSpecial: passwordPolicy.hasSpecial,
        noStudentId: passwordPolicy.noForbiddenSubstring,
        matched: passwordPolicy.matched ?? false,
    };
    const strengthScore = passwordPolicy.score;
    const passwordStrengthLabel = passwordPolicy.strengthLabel;
    const profileFields = [
        { label: "姓名", value: currentUser?.name ?? "-", testId: "student-profile-name" },
        { label: "学号", value: currentUser?.studentId ?? "-", testId: "student-profile-id", className: "font-mono" },
        { label: "班级", value: currentUser?.className ?? "-", testId: "student-profile-class" },
    ];

    const handleChangePassword = async () => {
        setError(null);
        setSuccess(false);
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setError("请填写完整信息");
            return;
        }
        if (passwordForm.newPassword === passwordForm.currentPassword) {
            setError("新密码不能与当前密码相同");
            return;
        }
        if (!passwordRules.minLength) {
            setError(`新密码长度至少为${STUDENT_PASSWORD_POLICY.minLength}位`);
            return;
        }
        if (!passwordRules.hasLetter || !passwordRules.hasNumber || !passwordRules.hasSpecial) {
            setError("新密码需包含字母、数字和特殊字符");
            return;
        }
        if (!passwordRules.noStudentId) {
            setError("新密码不能包含学号");
            return;
        }
        if (!passwordRules.matched) {
            setError("两次输入的新密码不一致");
            return;
        }

        setSaving(true);
        try {
            const res = await authApi.changePassword({
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword,
            });
            if (res.success) {
                setSuccess(true);
                setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                await refreshUser();
            } else {
                setError(res.error?.message ?? "修改失败");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "修改失败");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-foreground">个人信息</h2>
                    <p className="mt-1 text-sm text-muted-foreground">查看你的账号资料与安全设置</p>
                </div>
                <Button variant="outline" onClick={() => navigate("/")}>
                    <ArrowLeft data-icon="inline-start" />
                    返回首页
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card size="sm" className="overflow-hidden bg-muted/30 lg:col-span-2">
                    <CardHeader className="border-b border-border">
                        <CardTitle className="flex items-center gap-2 text-base normal-case tracking-normal">
                            <User className="size-5 text-primary" />
                            基础资料
                        </CardTitle>
                        <CardDescription>这些信息来自教务系统，无法直接修改。</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-6">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            {profileFields.map((field) => (
                                <div key={field.label} className="flex flex-col gap-2">
                                    <Label className="text-muted-foreground">{field.label}</Label>
                                    <div
                                        className={cn("rounded-md border border-border bg-background/60 px-3 py-2 text-foreground", field.className)}
                                        data-testid={field.testId}
                                    >
                                        {field.value}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/10 p-4">
                            <Shield className="mt-0.5 size-5 text-primary" />
                            <div className="text-sm leading-relaxed text-primary">
                                如需修改基础信息，请联系管理员或任课教师。
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card size="sm" className="bg-muted/30">
                    <CardHeader className="border-b border-border">
                        <CardTitle className="flex items-center gap-2 text-base normal-case tracking-normal">
                            <Key className="size-5 text-primary" />
                            修改密码
                        </CardTitle>
                        <CardDescription>建议定期更新密码以保护账号安全。</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form
                            className="flex flex-col gap-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void handleChangePassword();
                            }}
                        >
                            <input
                                type="text"
                                name="username"
                                autoComplete="username"
                                value={currentUser?.studentId ?? ""}
                                readOnly
                                hidden
                            />
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="currentPassword">当前密码</Label>
                                <Input
                                    id="currentPassword"
                                    type="password"
                                    value={passwordForm.currentPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                    autoComplete="current-password"
                                    data-testid="student-profile-password-current"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="newPassword">新密码</Label>
                                <Input
                                    id="newPassword"
                                    type="password"
                                    value={passwordForm.newPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                    autoComplete="new-password"
                                    data-testid="student-profile-password-new"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="confirmPassword">确认新密码</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={passwordForm.confirmPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                    autoComplete="new-password"
                                    data-testid="student-profile-password-confirm"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background/60 p-3 text-xs">
                                <div className="flex items-center justify-between text-muted-foreground">
                                    <span>密码强度</span>
                                    <span className={getStrengthClass(strengthScore)}>
                                        {passwordStrengthLabel}
                                    </span>
                                </div>
                                <div className={getRuleClass(passwordRules.minLength)}>{passwordRules.minLength ? "✓" : "✗"} 至少8个字符</div>
                                <div className={getRuleClass(passwordRules.hasLetter)}>{passwordRules.hasLetter ? "✓" : "✗"} 包含字母</div>
                                <div className={getRuleClass(passwordRules.hasNumber)}>{passwordRules.hasNumber ? "✓" : "✗"} 包含数字</div>
                                <div className={getRuleClass(passwordRules.hasSpecial)}>{passwordRules.hasSpecial ? "✓" : "✗"} 包含特殊字符</div>
                                <div className={getRuleClass(passwordRules.noStudentId)}>{passwordRules.noStudentId ? "✓" : "✗"} 不包含学号</div>
                                <div className={getRuleClass(passwordRules.matched)}>{passwordRules.matched ? "✓" : "✗"} 两次密码一致</div>
                            </div>
                            {error && <div className="rounded border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
                            {success && (
                                <div className="flex items-center gap-2 rounded border border-primary/20 bg-primary/10 p-2 text-sm text-primary">
                                    <CheckCircle2 className="size-4" />
                                    密码已更新
                                </div>
                            )}
                            <Button
                                type="submit"
                                className="mt-2 w-full"
                                disabled={saving}
                                data-testid="student-profile-password-save"
                            >
                                {saving && <Loader2 data-icon="inline-start" className="animate-spin" />}
                                {saving ? "保存中..." : "保存新密码"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default Profile;
