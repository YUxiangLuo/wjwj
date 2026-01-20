import { useState, useEffect } from "react";
import { Settings, FlaskConical, Shield, Database, Save, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { settingsApi, systemApi, authApi } from "../api-client";

interface SettingSection {
    id: string;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
}

const sections: SettingSection[] = [
    { id: "general", title: "基本设置", icon: Settings },
    { id: "experiment", title: "实验设置", icon: FlaskConical },
    { id: "security", title: "安全设置", icon: Shield },
    { id: "backup", title: "备份恢复", icon: Database },
];

export function SystemSettings() {
    const [activeSection, setActiveSection] = useState("general");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [backupLoading, setBackupLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [lastBackupId, setLastBackupId] = useState<string | null>(null);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [settings, setSettings] = useState({
        systemName: "抽样统计虚拟仿真系统",
        maintenanceMode: false,
        allowRegistration: true,
        maxLoginAttempts: 5,
        sessionTimeout: 30,
        experimentTimeLimit: 120,
        autoSaveInterval: 5,
        requireApproval: true,
        enableBackup: true,
        backupFrequency: "daily",
    });

    useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        try {
            const res = await settingsApi.get();
            if (res.success && res.data) {
                // Merge remote settings with default/local state
                // Note: Keys in DB might be snake_case if we strictly followed DB schema but 
                // in our API implementation we used whatever key was sent in body (which is camelCase from here).
                // So if we save camelCase, we get camelCase.
                // However, Seed script used snake_case. So we might need to handle both or migrate.
                // For now, let's assume we want to support both or verify what API returns.
                // The API logic: settings[c.configKey] = c.configValue.
                // If seed has "system_name", we get "system_name".
                // Our state has "systemName".
                // We should map them.

                const data = res.data;
                setSettings(prev => ({
                    ...prev,
                    systemName: data.system_name ?? data.systemName ?? prev.systemName,
                    maintenanceMode: data.maintenance_mode ?? data.maintenanceMode ?? prev.maintenanceMode,
                    allowRegistration: data.allow_registration ?? data.allowRegistration ?? prev.allowRegistration,
                    maxLoginAttempts: data.max_login_attempts ?? data.maxLoginAttempts ?? prev.maxLoginAttempts,
                    sessionTimeout: data.session_timeout ?? data.sessionTimeout ?? prev.sessionTimeout,
                    experimentTimeLimit: data.experiment_time_limit ?? data.experimentTimeLimit ?? prev.experimentTimeLimit,
                    autoSaveInterval: data.auto_save_interval ?? data.autoSaveInterval ?? prev.autoSaveInterval,
                    requireApproval: data.require_approval ?? data.requireApproval ?? prev.requireApproval,
                    enableBackup: data.enable_backup ?? data.enableBackup ?? prev.enableBackup,
                    backupFrequency: data.backup_frequency ?? data.backupFrequency ?? prev.backupFrequency,
                }));
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        } finally {
            setLoading(false);
        }
    }

    const handleSave = async () => {
        setSaving(true);
        try {
            // We save back as snake_case to match standard DB convention (if we care) or consistent with seed.
            // Let's use snake_case for persistence.
            const payload = {
                system_name: settings.systemName,
                maintenance_mode: settings.maintenanceMode,
                allow_registration: settings.allowRegistration,
                max_login_attempts: settings.maxLoginAttempts,
                session_timeout: settings.sessionTimeout,
                experiment_time_limit: settings.experimentTimeLimit,
                auto_save_interval: settings.autoSaveInterval,
                require_approval: settings.requireApproval,
                enable_backup: settings.enableBackup,
                backup_frequency: settings.backupFrequency,
            };

            const res = await settingsApi.update(payload);
            if (res.success) {
                alert("设置已保存！");
            } else {
                alert("保存失败");
            }
        } catch (error) {
            console.error("Failed to save settings:", error);
            alert("保存失败");
        } finally {
            setSaving(false);
        }
    };

    const handleCreateBackup = async () => {
        setBackupLoading(true);
        try {
            const res = await systemApi.createBackup();
            if (res.success && res.data) {
                setLastBackupId(res.data.backupId);
                alert(`备份已创建：${res.data.backupId}`);
            } else {
                alert(res.error?.message ?? "备份失败");
            }
        } catch (error) {
            console.error("Failed to create backup:", error);
            alert("备份失败");
        } finally {
            setBackupLoading(false);
        }
    };

    const handleRestoreBackup = async () => {
        const backupId = lastBackupId ?? window.prompt("请输入备份ID") ?? "";
        if (!backupId.trim()) return;

        if (!confirm(`确定从备份 ${backupId} 恢复吗？此操作可能覆盖当前数据。`)) {
            return;
        }

        setRestoreLoading(true);
        try {
            const res = await systemApi.restoreBackup(backupId.trim());
            if (res.success) {
                alert("恢复操作已提交");
            } else {
                alert(res.error?.message ?? "恢复失败");
            }
        } catch (error) {
            console.error("Failed to restore backup:", error);
            alert("恢复失败");
        } finally {
            setRestoreLoading(false);
        }
    };

    const handleChangePassword = async () => {
        setPasswordError(null);
        if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
            setPasswordError("请填写完整信息");
            return;
        }
        if (passwordForm.newPassword.length < 6) {
            setPasswordError("新密码长度至少为6位");
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            setPasswordError("两次输入的新密码不一致");
            return;
        }

        setPasswordSaving(true);
        try {
            const res = await authApi.changePassword({
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword,
            });
            if (res.success) {
                setShowPasswordModal(false);
                setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            } else {
                setPasswordError(res.error?.message ?? "修改失败");
            }
        } catch (error) {
            console.error("Failed to change password:", error);
            setPasswordError("修改失败");
        } finally {
            setPasswordSaving(false);
        }
    };

    return (
        <div className="flex gap-6">
            <div className="w-56 shrink-0">
                <Card className="p-2">
                    {sections.map((section) => {
                        const Icon = section.icon;
                        return (
                            <Button
                                key={section.id}
                                variant="ghost"
                                onClick={() => setActiveSection(section.id)}
                                className={`w-full justify-start gap-3 ${activeSection === section.id
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground"
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                <span>{section.title}</span>
                            </Button>
                        );
                    })}
                </Card>
            </div>

            <Card className="flex-1">
                <CardContent className="pt-6">
                    {activeSection === "general" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">基本设置</h3>
                                <Separator className="mt-4" />
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="systemName">系统名称</Label>
                                    <Input
                                        id="systemName"
                                        value={settings.systemName}
                                        onChange={(e) => setSettings({ ...settings, systemName: e.target.value })}
                                    />
                                </div>
                                <div className="flex items-center justify-between py-3 border-b">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">维护模式</div>
                                        <div className="text-xs text-muted-foreground">开启后仅管理员可访问系统</div>
                                    </div>
                                    <Switch
                                        checked={settings.maintenanceMode}
                                        onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
                                    />
                                </div>
                                <div className="flex items-center justify-between py-3 border-b">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">开放注册</div>
                                        <div className="text-xs text-muted-foreground">允许新用户自行注册账号</div>
                                    </div>
                                    <Switch
                                        checked={settings.allowRegistration}
                                        onCheckedChange={(checked) => setSettings({ ...settings, allowRegistration: checked })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSection === "experiment" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">实验设置</h3>
                                <Separator className="mt-4" />
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="experimentTimeLimit">实验时间限制（分钟）</Label>
                                    <Input
                                        id="experimentTimeLimit"
                                        type="number"
                                        className="w-32"
                                        value={settings.experimentTimeLimit}
                                        onChange={(e) => setSettings({ ...settings, experimentTimeLimit: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="autoSaveInterval">自动保存间隔（分钟）</Label>
                                    <Input
                                        id="autoSaveInterval"
                                        type="number"
                                        className="w-32"
                                        value={settings.autoSaveInterval}
                                        onChange={(e) => setSettings({ ...settings, autoSaveInterval: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="flex items-center justify-between py-3 border-b">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">提交需审批</div>
                                        <div className="text-xs text-muted-foreground">学生提交实验后需要教师审批</div>
                                    </div>
                                    <Switch
                                        checked={settings.requireApproval}
                                        onCheckedChange={(checked) => setSettings({ ...settings, requireApproval: checked })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSection === "security" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">安全设置</h3>
                                <Separator className="mt-4" />
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="maxLoginAttempts">最大登录尝试次数</Label>
                                    <Input
                                        id="maxLoginAttempts"
                                        type="number"
                                        className="w-32"
                                        value={settings.maxLoginAttempts}
                                        onChange={(e) => setSettings({ ...settings, maxLoginAttempts: parseInt(e.target.value) || 0 })}
                                    />
                                    <p className="text-xs text-muted-foreground">超过次数后账号将被锁定</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="sessionTimeout">会话超时时间（分钟）</Label>
                                    <Input
                                        id="sessionTimeout"
                                        type="number"
                                        className="w-32"
                                        value={settings.sessionTimeout}
                                        onChange={(e) => setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="pt-2">
                                    <Button variant="outline" onClick={() => setShowPasswordModal(true)}>
                                        <Lock className="w-4 h-4 mr-2" />
                                        修改管理员密码
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeSection === "backup" && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">备份恢复</h3>
                                <Separator className="mt-4" />
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between py-3 border-b">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">自动备份</div>
                                        <div className="text-xs text-muted-foreground">定期自动备份数据库和文件</div>
                                    </div>
                                    <Switch
                                        checked={settings.enableBackup}
                                        onCheckedChange={(checked) => setSettings({ ...settings, enableBackup: checked })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>备份频率</Label>
                                    <Select value={settings.backupFrequency} onValueChange={(v) => setSettings({ ...settings, backupFrequency: v })}>
                                        <SelectTrigger className="w-48">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="hourly">每小时</SelectItem>
                                            <SelectItem value="daily">每天</SelectItem>
                                            <SelectItem value="weekly">每周</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex gap-3 pt-4">
                                    <Button onClick={handleCreateBackup} disabled={backupLoading}>
                                        <Database className="w-4 h-4" />
                                        {backupLoading ? "备份中..." : "立即备份"}
                                    </Button>
                                    <Button variant="outline" onClick={handleRestoreBackup} disabled={restoreLoading}>
                                        {restoreLoading ? "恢复中..." : "恢复备份"}
                                    </Button>
                                </div>
                                {lastBackupId && (
                                    <div className="text-xs text-muted-foreground">最近备份：{lastBackupId}</div>
                                )}
                            </div>
                        </div>
                    )}

                    <Separator className="my-8" />

                    <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            保存设置
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>修改管理员密码</DialogTitle>
                        <DialogDescription>请输入当前密码和新密码</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
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
                        {passwordError && <div className="text-sm text-destructive">{passwordError}</div>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPasswordModal(false)} disabled={passwordSaving}>
                            取消
                        </Button>
                        <Button onClick={handleChangePassword} disabled={passwordSaving}>
                            {passwordSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
