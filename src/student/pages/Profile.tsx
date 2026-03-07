import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, User, Key, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STUDENT_PASSWORD_POLICY, evaluatePasswordRules } from "@/lib/password-policy";
import { authApi } from "../api-client";
import { useStudent } from "../contexts/StudentContext";

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
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        个人信息
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">查看你的账号资料与安全设置</p>
                </div>
                <Button variant="outline" onClick={() => navigate("/")} className="border-slate-700 hover:bg-slate-800 text-slate-300">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    返回首页
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 border-indigo-500/20 bg-slate-900/40 backdrop-blur-xl shadow-2xl overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-cyan-400 opacity-20" />
                    <CardHeader className="border-b border-slate-700/30 pb-4">
                        <CardTitle className="flex items-center gap-2 text-slate-100">
                            <User className="w-5 h-5 text-indigo-500" />
                            基础资料
                        </CardTitle>
                        <CardDescription className="text-slate-400">这些信息来自教务系统，无法直接修改。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label className="text-slate-400">姓名</Label>
                                <div className="px-3 py-2 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-200" data-testid="student-profile-name">
                                    {currentUser?.name ?? "-"}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-400">学号</Label>
                                <div className="px-3 py-2 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-200 font-mono" data-testid="student-profile-id">
                                    {currentUser?.studentId ?? "-"}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-400">班级</Label>
                                <div className="px-3 py-2 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-200" data-testid="student-profile-class">
                                    {currentUser?.className ?? "-"}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-slate-400">班级编号</Label>
                                <div className="px-3 py-2 rounded-md bg-slate-800/50 border border-slate-700/50 text-slate-200 font-mono">
                                    {currentUser?.classId?.toString() ?? "-"}
                                </div>
                            </div>
                        </div>

                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
                            <Shield className="w-5 h-5 text-amber-500 mt-0.5" />
                            <div className="text-sm text-amber-200/80 leading-relaxed">
                                如需修改基础信息，请联系管理员或任课教师。
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-indigo-500/20 bg-slate-900/40 backdrop-blur-xl shadow-2xl">
                    <CardHeader className="border-b border-slate-700/30 pb-4">
                        <CardTitle className="flex items-center gap-2 text-slate-100">
                            <Key className="w-5 h-5 text-indigo-500" />
                            修改密码
                        </CardTitle>
                        <CardDescription className="text-slate-400">建议定期更新密码以保护账号安全。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword" className="text-slate-300">当前密码</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                value={passwordForm.currentPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                autoComplete="current-password"
                                data-testid="student-profile-password-current"
                                className="bg-slate-950/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPassword" className="text-slate-300">新密码</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                value={passwordForm.newPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                autoComplete="new-password"
                                data-testid="student-profile-password-new"
                                className="bg-slate-950/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-slate-300">确认新密码</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={passwordForm.confirmPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                autoComplete="new-password"
                                data-testid="student-profile-password-confirm"
                                className="bg-slate-950/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:ring-indigo-500/20"
                            />
                        </div>
                        <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs space-y-1.5">
                            <div className="flex items-center justify-between text-slate-400">
                                <span>密码强度</span>
                                <span className={strengthScore <= 2 ? "text-rose-600" : strengthScore <= 4 ? "text-amber-600" : "text-emerald-600"}>
                                    {passwordStrengthLabel}
                                </span>
                            </div>
                            <div className={passwordRules.minLength ? "text-emerald-600" : "text-slate-500"}>{passwordRules.minLength ? "✓" : "✗"} 至少8个字符</div>
                            <div className={passwordRules.hasLetter ? "text-emerald-600" : "text-slate-500"}>{passwordRules.hasLetter ? "✓" : "✗"} 包含字母</div>
                            <div className={passwordRules.hasNumber ? "text-emerald-600" : "text-slate-500"}>{passwordRules.hasNumber ? "✓" : "✗"} 包含数字</div>
                            <div className={passwordRules.hasSpecial ? "text-emerald-600" : "text-slate-500"}>{passwordRules.hasSpecial ? "✓" : "✗"} 包含特殊字符</div>
                            <div className={passwordRules.noStudentId ? "text-emerald-600" : "text-slate-500"}>{passwordRules.noStudentId ? "✓" : "✗"} 不包含学号</div>
                            <div className={passwordRules.matched ? "text-emerald-600" : "text-slate-500"}>{passwordRules.matched ? "✓" : "✗"} 两次密码一致</div>
                        </div>
                        {error && <div className="text-sm text-red-600 bg-red-500/10 p-2 rounded border border-red-500/20">{error}</div>}
                        {success && (
                            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                                <CheckCircle2 className="w-4 h-4" />
                                密码已更新
                            </div>
                        )}
                        <Button
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 mt-2"
                            onClick={handleChangePassword}
                            disabled={saving}
                            data-testid="student-profile-password-save"
                        >
                            {saving ? "保存中..." : "保存新密码"}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default Profile;
