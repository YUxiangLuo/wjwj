import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, FlaskConical, Shield, Database, Save, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { settingsApi, systemApi, authApi, type BackupInfo } from "../api-client";
import { toast } from "sonner";

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

const sectionDescriptions: Record<string, string> = {
    general: "系统名称、维护模式与注册策略",
    experiment: "实验时长、自动保存与审批流程",
    security: "登录保护与会话超时策略",
    backup: "自动备份、保留周期与恢复操作",
};

export function SystemSettings() {
    const navigate = useNavigate();
    const [activeSection, setActiveSection] = useState("general");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [backupLoading, setBackupLoading] = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [lastBackupId, setLastBackupId] = useState<string | null>(null);
    const [showRestoreModal, setShowRestoreModal] = useState(false);
    const [restoreForm, setRestoreForm] = useState({ backupId: "", password: "", confirmPassword: "" });
    const [restoreError, setRestoreError] = useState<string | null>(null);
    const [backupList, setBackupList] = useState<BackupInfo[]>([]);
    const [backupListLoading, setBackupListLoading] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [settings, setSettings] = useState({
        systemName: "抽样统计虚拟仿真系统",
        maintenanceMode: false,
        allowRegistration: true,
        maxLoginAttempts: 5,
        lockDurationMinutes: 30,
        adminSessionTimeout: 30,
        teacherSessionTimeout: 120,
        studentSessionTimeout: 240,
        experimentTimeLimit: 120,
        autoSaveInterval: 5,
        requireApproval: true,
        enableBackup: true,
        backupFrequency: "daily",
        backupRetentionDays: 30,
    });

    const activeMeta = sections.find((section) => section.id === activeSection) ?? sections[0];
    const SectionIcon = activeMeta.icon;

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
                    maxLoginAttempts: data["login.max_fail_count"] ?? data.maxLoginAttempts ?? prev.maxLoginAttempts,
                    lockDurationMinutes: data["login.lock_duration_minutes"] ?? data.lockDurationMinutes ?? prev.lockDurationMinutes,
                    adminSessionTimeout: data["session.admin_timeout_minutes"] ?? data.adminSessionTimeout ?? prev.adminSessionTimeout,
                    teacherSessionTimeout: data["session.teacher_timeout_minutes"] ?? data.teacherSessionTimeout ?? prev.teacherSessionTimeout,
                    studentSessionTimeout: data["session.student_timeout_minutes"] ?? data.studentSessionTimeout ?? prev.studentSessionTimeout,
                    experimentTimeLimit: data.experiment_time_limit ?? data.experimentTimeLimit ?? prev.experimentTimeLimit,
                    autoSaveInterval: data.auto_save_interval ?? data.autoSaveInterval ?? prev.autoSaveInterval,
                    requireApproval: data.require_approval ?? data.requireApproval ?? prev.requireApproval,
                    enableBackup: data.enable_backup ?? data.enableBackup ?? prev.enableBackup,
                    backupFrequency: data.backup_frequency ?? data.backupFrequency ?? prev.backupFrequency,
                    backupRetentionDays: data["backup.retention_days"] ?? data.backupRetentionDays ?? prev.backupRetentionDays,
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
                "login.max_fail_count": settings.maxLoginAttempts,
                "login.lock_duration_minutes": settings.lockDurationMinutes,
                "session.admin_timeout_minutes": settings.adminSessionTimeout,
                "session.teacher_timeout_minutes": settings.teacherSessionTimeout,
                "session.student_timeout_minutes": settings.studentSessionTimeout,
                experiment_time_limit: settings.experimentTimeLimit,
                auto_save_interval: settings.autoSaveInterval,
                require_approval: settings.requireApproval,
                enable_backup: settings.enableBackup,
                backup_frequency: settings.backupFrequency,
                "backup.retention_days": settings.backupRetentionDays,
            };

            const res = await settingsApi.update(payload);
            if (res.success) {
                toast.success("设置已保存！");
            } else {
                toast.error("保存失败");
            }
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast.error("保存失败");
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
                toast.success(`备份已创建：${res.data.backupId}`);
            } else {
                toast.error(res.error?.message ?? "备份失败");
            }
        } catch (error) {
            console.error("Failed to create backup:", error);
            toast.error("备份失败");
        } finally {
            setBackupLoading(false);
        }
    };

    const handleRestoreBackup = async () => {
        setRestoreError(null);
        setBackupListLoading(true);
        setRestoreForm({
            backupId: lastBackupId ?? "",
            password: "",
            confirmPassword: "",
        });
        try {
            const res = await systemApi.listBackups();
            if (res.success && res.data) {
                const data = res.data;
                setBackupList(data);
                if (!lastBackupId) {
                    const firstBackupId = data.at(0)?.backupId;
                    if (firstBackupId) {
                        setRestoreForm(prev => ({ ...prev, backupId: firstBackupId }));
                    }
                }
            } else {
                setBackupList([]);
            }
        } catch (error) {
            console.error("Failed to load backups:", error);
            setBackupList([]);
        } finally {
            setBackupListLoading(false);
        }
        setShowRestoreModal(true);
    };

    const handleConfirmRestore = async () => {
        setRestoreError(null);
        if (!restoreForm.backupId.trim()) {
            setRestoreError("请输入备份ID");
            return;
        }
        if (!restoreForm.password || !restoreForm.confirmPassword) {
            setRestoreError("请输入管理员密码确认");
            return;
        }
        if (restoreForm.password !== restoreForm.confirmPassword) {
            setRestoreError("两次输入的密码不一致");
            return;
        }

        setRestoreLoading(true);
        try {
            const res = await systemApi.restoreBackup({
                backupId: restoreForm.backupId.trim(),
                password: restoreForm.password,
                confirmPassword: restoreForm.confirmPassword,
            });
            if (res.success) {
                setShowRestoreModal(false);
                toast.success("恢复操作已完成，请重新登录。");
                await authApi.logout();
                navigate("/login", { replace: true });
            } else {
                setRestoreError(res.error?.message ?? "恢复失败");
            }
        } catch (error) {
            console.error("Failed to restore backup:", error);
            setRestoreError("恢复失败");
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
        if (passwordForm.newPassword.length < 12) {
            setPasswordError("新密码长度至少为12位");
            return;
        }
        if (!/[A-Za-z]/.test(passwordForm.newPassword) || !/\d/.test(passwordForm.newPassword) || !/[!@#$%^&*(),.?":{}|<>\[\]\\/\-_=+~`]/.test(passwordForm.newPassword)) {
            setPasswordError("新密码需包含字母、数字和特殊字符");
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
        <div className="space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">系统设置</h2>
                    <p className="text-sm text-slate-500 mt-1">集中管理系统参数、安全策略与备份方案。</p>
                </div>
            </div>

            <div className="flex flex-col gap-6 xl:flex-row">
                <div className="xl:w-64 shrink-0">
                    <Card className="border-slate-200 shadow-sm">
                        <CardContent className="p-2 space-y-1">
                            {sections.map((section) => {
                                const Icon = section.icon;
                                const isActive = activeSection === section.id;
                                return (
                                    <Button
                                        key={section.id}
                                        variant="ghost"
                                        onClick={() => setActiveSection(section.id)}
                                        className={`w-full justify-start gap-3 ${isActive
                                            ? "bg-blue-50 text-blue-600"
                                            : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        <span>{section.title}</span>
                                    </Button>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>

                <Card className="flex-1 border-slate-200 shadow-sm">
                    <CardContent className="pt-6 space-y-6">
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                                <SectionIcon className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">{activeMeta.title}</h3>
                                <p className="text-sm text-slate-500 mt-1">{sectionDescriptions[activeMeta.id]}</p>
                            </div>
                        </div>
                    {activeSection === "general" && (
                        <div className="space-y-6">
                            <Separator className="bg-slate-200" />
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="systemName">系统名称</Label>
                                    <Input
                                        id="systemName"
                                        value={settings.systemName}
                                        onChange={(e) => setSettings({ ...settings, systemName: e.target.value })}
                                    />
                                </div>
                                <div className="flex items-center justify-between py-3 border-b border-slate-200">
                                    <div>
                                        <div className="text-sm font-medium text-slate-900">维护模式</div>
                                        <div className="text-xs text-slate-500">开启后仅管理员可访问系统</div>
                                    </div>
                                    <Switch
                                        checked={settings.maintenanceMode}
                                        onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
                                    />
                                </div>
                                <div className="flex items-center justify-between py-3 border-b border-slate-200">
                                    <div>
                                        <div className="text-sm font-medium text-slate-900">开放注册</div>
                                        <div className="text-xs text-slate-500">允许新用户自行注册账号</div>
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
                            <Separator className="bg-slate-200" />
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
                                <div className="flex items-center justify-between py-3 border-b border-slate-200">
                                    <div>
                                        <div className="text-sm font-medium text-slate-900">提交需审批</div>
                                        <div className="text-xs text-slate-500">学生提交实验后需要教师审批</div>
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
                            <Separator className="bg-slate-200" />
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
                                    <p className="text-xs text-slate-500">超过次数后账号将被锁定</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="lockDurationMinutes">锁定时长（分钟）</Label>
                                    <Input
                                        id="lockDurationMinutes"
                                        type="number"
                                        className="w-32"
                                        value={settings.lockDurationMinutes}
                                        onChange={(e) => setSettings({ ...settings, lockDurationMinutes: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="adminSessionTimeout">管理员会话超时时间（分钟）</Label>
                                    <Input
                                        id="adminSessionTimeout"
                                        type="number"
                                        className="w-32"
                                        value={settings.adminSessionTimeout}
                                        onChange={(e) => setSettings({ ...settings, adminSessionTimeout: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="teacherSessionTimeout">教师会话超时时间（分钟）</Label>
                                    <Input
                                        id="teacherSessionTimeout"
                                        type="number"
                                        className="w-32"
                                        value={settings.teacherSessionTimeout}
                                        onChange={(e) => setSettings({ ...settings, teacherSessionTimeout: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="studentSessionTimeout">学生会话超时时间（分钟）</Label>
                                    <Input
                                        id="studentSessionTimeout"
                                        type="number"
                                        className="w-32"
                                        value={settings.studentSessionTimeout}
                                        onChange={(e) => setSettings({ ...settings, studentSessionTimeout: parseInt(e.target.value) || 0 })}
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
                            <Separator className="bg-slate-200" />
                            <div className="space-y-4">
                                <div className="flex items-center justify-between py-3 border-b border-slate-200">
                                    <div>
                                        <div className="text-sm font-medium text-slate-900">自动备份</div>
                                        <div className="text-xs text-slate-500">定期自动备份数据库和文件</div>
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
                                <div className="space-y-2">
                                    <Label htmlFor="backupRetentionDays">备份保留天数</Label>
                                    <Input
                                        id="backupRetentionDays"
                                        type="number"
                                        className="w-32"
                                        value={settings.backupRetentionDays}
                                        onChange={(e) => setSettings({ ...settings, backupRetentionDays: parseInt(e.target.value) || 0 })}
                                    />
                                    <div className="text-xs text-slate-500">超过天数的备份会被自动清理</div>
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
                                    <div className="text-xs text-slate-500">最近备份：{lastBackupId}</div>
                                )}
                            </div>
                        </div>
                    )}

                    <Separator className="my-8 bg-slate-200" />

                    <div className="flex justify-end">
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                            保存设置
                        </Button>
                    </div>
                    </CardContent>
                </Card>
            </div>

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

            <Dialog open={showRestoreModal} onOpenChange={setShowRestoreModal}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>恢复备份</DialogTitle>
                        <DialogDescription>
                            恢复将清空当前数据库并覆盖 public 文件，请确认并输入管理员密码。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="restoreBackupId">选择备份</Label>
                            <Select
                                value={restoreForm.backupId}
                                onValueChange={(value) => setRestoreForm({ ...restoreForm, backupId: value })}
                            >
                                <SelectTrigger id="restoreBackupId">
                                    <SelectValue placeholder={backupListLoading ? "加载中..." : "请选择备份"} />
                                </SelectTrigger>
                                <SelectContent>
                                    {backupList.map((item) => (
                                        <SelectItem key={item.backupId} value={item.backupId}>
                                            {item.backupId} {item.hasZip ? "" : "(缺少ZIP)"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {backupListLoading ? (
                                <div className="text-xs text-muted-foreground">正在加载备份列表...</div>
                            ) : backupList.length > 0 ? (
                                <div className="text-xs text-muted-foreground">
                                    {backupList.find(item => item.backupId === restoreForm.backupId)?.createdAt ?
                                        `备份时间：${new Date(backupList.find(item => item.backupId === restoreForm.backupId)!.createdAt).toLocaleString("zh-CN")}`
                                        : ""
                                    }
                                </div>
                            ) : (
                                <div className="text-xs text-muted-foreground">暂无备份</div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="restorePassword">管理员密码</Label>
                            <Input
                                id="restorePassword"
                                type="password"
                                value={restoreForm.password}
                                onChange={(e) => setRestoreForm({ ...restoreForm, password: e.target.value })}
                                autoComplete="current-password"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="restoreConfirmPassword">确认管理员密码</Label>
                            <Input
                                id="restoreConfirmPassword"
                                type="password"
                                value={restoreForm.confirmPassword}
                                onChange={(e) => setRestoreForm({ ...restoreForm, confirmPassword: e.target.value })}
                                autoComplete="current-password"
                            />
                        </div>
                        {restoreError && <div className="text-sm text-destructive">{restoreError}</div>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRestoreModal(false)} disabled={restoreLoading}>
                            取消
                        </Button>
                        <Button onClick={handleConfirmRestore} disabled={restoreLoading}>
                            {restoreLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            确认恢复
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
