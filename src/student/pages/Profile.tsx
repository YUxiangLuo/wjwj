import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

    const handleChangePassword = async () => {
        setError(null);
        setSuccess(false);
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setError("请填写完整信息");
            return;
        }
        if (passwordForm.newPassword.length < 8) {
            setError("新密码长度至少为8位");
            return;
        }
        if (!/[A-Za-z]/.test(passwordForm.newPassword) || !/\d/.test(passwordForm.newPassword) || !/[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+~`]/.test(passwordForm.newPassword)) {
            setError("新密码需包含字母、数字和特殊字符");
            return;
        }
        if (currentUser?.studentId && passwordForm.newPassword.includes(currentUser.studentId)) {
            setError("新密码不能包含学号");
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
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
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-semibold">个人信息</h2>
                    <p className="text-sm text-muted-foreground">查看你的账号资料与安全设置</p>
                </div>
                <Button variant="outline" onClick={() => navigate("/")}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    返回首页
                </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                    <CardHeader>
                        <CardTitle>基础资料</CardTitle>
                        <CardDescription>这些信息来自教务系统，无法直接修改。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Label>姓名</Label>
                                <Input value={currentUser?.name ?? "-"} readOnly />
                            </div>
                            <div>
                                <Label>学号</Label>
                                <Input value={currentUser?.studentId ?? "-"} readOnly />
                            </div>
                            <div>
                                <Label>班级</Label>
                                <Input value={currentUser?.className ?? "-"} readOnly />
                            </div>
                            <div>
                                <Label>班级编号</Label>
                                <Input value={currentUser?.classId?.toString() ?? "-"} readOnly />
                            </div>
                        </div>
                        <Separator />
                        <div className="text-sm text-muted-foreground">
                            如需修改基础信息，请联系管理员或任课教师。
                        </div>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl border-white/70 bg-white/80 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
                    <CardHeader>
                        <CardTitle>修改密码</CardTitle>
                        <CardDescription>建议定期更新密码以保护账号安全。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword">当前密码</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                value={passwordForm.currentPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                autoComplete="current-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="newPassword">新密码</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                value={passwordForm.newPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">确认新密码</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={passwordForm.confirmPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                autoComplete="new-password"
                            />
                        </div>
                        {error && <div className="text-sm text-destructive">{error}</div>}
                        {success && (
                            <div className="flex items-center gap-2 text-sm text-emerald-600">
                                <CheckCircle2 className="w-4 h-4" />
                                密码已更新
                            </div>
                        )}
                        <Button className="w-full" onClick={handleChangePassword} disabled={saving}>
                            {saving ? "保存中..." : "保存新密码"}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default Profile;
