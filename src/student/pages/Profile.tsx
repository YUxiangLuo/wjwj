import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/PageHeader";
import { STUDENT_PASSWORD_POLICY, evaluatePasswordRules } from "@/lib/password-policy";
import { authApi } from "../api-client";
import { useStudent } from "../contexts/StudentContext";

export function Profile() {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useStudent();
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(() => new URLSearchParams(location.search).get("passwordChanged") === "1");
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get("passwordChanged") !== "1") return;
        // Consume the non-secret notice so refreshing or returning does not replay it.
        params.delete("passwordChanged");
        navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true, state: location.state });
    }, [location, navigate]);
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
        <div className="mx-auto max-w-5xl space-y-6">
            <PageHeader border={false}>
                <div>
                    <h1 className="text-page-title font-medium text-foreground">
                        个人信息
                    </h1>
                    <p className="mt-1 text-label text-muted-foreground">查看你的账号资料与安全设置</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate("/")}>
                    <ArrowLeft className="h-4 w-4" />
                    返回首页
                </Button>
            </PageHeader>

            <div className="grid grid-cols-3 gap-6">
                <Card className="col-span-2 border-border bg-card">
                    <CardHeader className="border-b border-border pb-4">
                        <div className="flex items-center gap-3.5">
                            <Avatar className="h-12 w-12">
                                <AvatarFallback className="bg-muted text-subheading font-medium text-foreground">
                                    {currentUser?.name?.charAt(0) ?? "学"}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <CardTitle className="text-subheading font-medium text-foreground">
                                    基础资料
                                </CardTitle>
                                <CardDescription className="text-muted-foreground">
                                    这些信息同步自教务系统，不支持在此直接修改。
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-5 pt-2">
                        <dl className="divide-y divide-border">
                            <div className="flex items-center justify-between gap-4 py-3.5">
                                <dt className="w-28 shrink-0 text-label text-muted-foreground">姓名</dt>
                                <dd className="min-w-0 flex-1 text-label font-medium text-foreground" data-testid="student-profile-name">
                                    {currentUser?.name ?? "-"}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-4 py-3.5">
                                <dt className="w-28 shrink-0 text-label text-muted-foreground">学号</dt>
                                <dd className="min-w-0 flex-1 text-label font-medium tabular-nums text-foreground" data-testid="student-profile-id">
                                    {currentUser?.studentId ?? "-"}
                                </dd>
                            </div>
                            <div className="flex items-center justify-between gap-4 py-3.5">
                                <dt className="w-28 shrink-0 text-label text-muted-foreground">所属班级</dt>
                                <dd className="min-w-0 flex-1 text-label font-medium text-foreground" data-testid="student-profile-class">
                                    {currentUser?.className ?? "-"}
                                </dd>
                            </div>
                        </dl>

                        <p className="rounded-surface bg-muted px-4 py-3 text-meta leading-relaxed text-muted-foreground">
                            如需变更姓名或班级归属，请联系任课教师或系统管理员协助处理。
                        </p>
                    </CardContent>
                </Card>

                <Card className="border-border bg-card">
                    <CardHeader className="border-b border-border pb-4">
                        <CardTitle className="text-subheading font-medium text-foreground">
                            修改密码
                        </CardTitle>
                        <CardDescription className="text-muted-foreground">建议定期更新密码以保护账号安全。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="currentPassword" className="text-foreground">当前密码</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                value={passwordForm.currentPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? "student-profile-password-error" : undefined}
                                autoComplete="current-password"
                                data-testid="student-profile-password-current"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="newPassword" className="text-foreground">新密码</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                value={passwordForm.newPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? "student-profile-password-error" : undefined}
                                autoComplete="new-password"
                                data-testid="student-profile-password-new"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirmPassword" className="text-foreground">确认新密码</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={passwordForm.confirmPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                aria-invalid={error ? true : undefined}
                                aria-describedby={error ? "student-profile-password-error" : undefined}
                                autoComplete="new-password"
                                data-testid="student-profile-password-confirm"
                            />
                        </div>
                        <div className="space-y-1.5 rounded-surface bg-muted p-3.5 text-meta">
                            <div className="flex items-center justify-between text-muted-foreground">
                                <span>密码强度</span>
                                <span className={strengthScore <= 2 ? "font-medium text-destructive" : strengthScore <= 4 ? "font-medium text-warning" : "font-medium text-success"}>
                                    {passwordStrengthLabel}
                                </span>
                            </div>
                            <div className={passwordRules.minLength ? "text-success" : "text-muted-foreground"}>{passwordRules.minLength ? "✓" : "·"} 至少 8 个字符</div>
                            <div className={passwordRules.hasLetter ? "text-success" : "text-muted-foreground"}>{passwordRules.hasLetter ? "✓" : "·"} 包含字母</div>
                            <div className={passwordRules.hasNumber ? "text-success" : "text-muted-foreground"}>{passwordRules.hasNumber ? "✓" : "·"} 包含数字</div>
                            <div className={passwordRules.hasSpecial ? "text-success" : "text-muted-foreground"}>{passwordRules.hasSpecial ? "✓" : "·"} 包含特殊字符</div>
                            <div className={passwordRules.noStudentId ? "text-success" : "text-muted-foreground"}>{passwordRules.noStudentId ? "✓" : "·"} 不包含学号</div>
                            <div className={passwordRules.matched ? "text-success" : "text-muted-foreground"}>{passwordRules.matched ? "✓" : "·"} 两次密码一致</div>
                        </div>
                        {error && (
                            <div
                                id="student-profile-password-error"
                                role="alert"
                                aria-atomic="true"
                                className="rounded-control border border-destructive-border bg-destructive-muted px-3 py-2 text-label text-destructive"
                            >
                                {error}
                            </div>
                        )}
                        {success && (
                            <div
                                role="status"
                                aria-live="polite"
                                className="flex items-center gap-2 rounded-control border border-success-border bg-success-muted px-3 py-2 text-label text-success"
                            >
                                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                                密码已更新
                            </div>
                        )}
                        <div className="flex justify-end pt-1">
                            <Button
                                variant="secondary"
                                onClick={handleChangePassword}
                                disabled={saving}
                                aria-busy={saving}
                                data-testid="student-profile-password-save"
                            >
                                {saving ? "保存中..." : "保存新密码"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default Profile;
