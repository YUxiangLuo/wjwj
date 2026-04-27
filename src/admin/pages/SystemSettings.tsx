import { useState, useEffect } from "react";
import { Settings, FlaskConical, Shield, Save, Loader2, Lock, FileText, Bell } from "lucide-react";
import { PasswordChangeDialog } from "@/components/PasswordChangeDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ADMIN_PASSWORD_POLICY } from "@/lib/password-policy";
import { usePasswordChange } from "@/hooks/usePasswordChange";
import { settingsApi, authApi } from "../api-client";
import { validateAdminSettingsPayload } from "../settings-validation";
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
    { id: "file-limits", title: "文件限制", icon: FileText },
    { id: "notifications", title: "通知设置", icon: Bell },
];

const sectionDescriptions: Record<string, string> = {
    general: "系统名称、维护模式与注册策略",
    experiment: "实验时长、自动保存与审批流程",
    security: "登录保护与会话超时策略",
    "file-limits": "Excel行数、附件大小与批量导入限制",
    notifications: "截止提醒与通知保留策略",
};

export function SystemSettings() {
    const [activeSection, setActiveSection] = useState("general");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [adminUsername, setAdminUsername] = useState<string | null>(null);
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
        excelMaxRows: 100000,
        maxAttachmentSizeMb: 10,
        batchImportMaxRows: 500,
        deadlineReminderHours: 24,
        notificationRetentionDays: 90,
    });

    const activeMeta = sections.find((section) => section.id === activeSection) ?? sections[0]!;
    const SectionIcon = activeMeta.icon;
    const passwordChange = usePasswordChange({
        policy: ADMIN_PASSWORD_POLICY,
        forbiddenSubstrings: [adminUsername],
        onSubmit: authApi.changePassword,
        onSuccess: () => {
            setShowPasswordModal(false);
            toast.success("密码修改成功");
        },
    });

    useEffect(() => {
        loadSettings();
    }, []);

    useEffect(() => {
        authApi.me()
            .then((res) => {
                if (res.success) {
                    setAdminUsername(res.data?.username ?? null);
                }
            })
            .catch(() => {
                setAdminUsername(null);
            });
    }, []);

    async function loadSettings() {
        try {
            const res = await settingsApi.get();
            if (res.success && res.data) {
                const data = res.data as Record<string, string | number | boolean | undefined>;
                setSettings(prev => ({
                    ...prev,
                    systemName: (data.system_name as string) ?? prev.systemName,
                    maintenanceMode: (data.maintenance_mode as boolean) ?? prev.maintenanceMode,
                    allowRegistration: (data.allow_registration as boolean) ?? prev.allowRegistration,
                    maxLoginAttempts: (data["login.max_fail_count"] as number) ?? prev.maxLoginAttempts,
                    lockDurationMinutes: (data["login.lock_duration_minutes"] as number) ?? prev.lockDurationMinutes,
                    adminSessionTimeout: (data["session.admin_timeout_minutes"] as number) ?? prev.adminSessionTimeout,
                    teacherSessionTimeout: (data["session.teacher_timeout_minutes"] as number) ?? prev.teacherSessionTimeout,
                    studentSessionTimeout: (data["session.student_timeout_minutes"] as number) ?? prev.studentSessionTimeout,
                    experimentTimeLimit: (data.experiment_time_limit as number) ?? prev.experimentTimeLimit,
                    autoSaveInterval: (data.auto_save_interval as number) ?? prev.autoSaveInterval,
                    requireApproval: (data.require_approval as boolean) ?? prev.requireApproval,
                    excelMaxRows: (data["file.excel_max_rows"] as number) ?? prev.excelMaxRows,
                    maxAttachmentSizeMb: (data["file.max_attachment_size_mb"] as number) ?? prev.maxAttachmentSizeMb,
                    batchImportMaxRows: (data["file.batch_import_max_rows"] as number) ?? prev.batchImportMaxRows,
                    deadlineReminderHours: (data["notification.deadline_reminder_hours"] as number) ?? prev.deadlineReminderHours,
                    notificationRetentionDays: (data["notification.retention_days"] as number) ?? prev.notificationRetentionDays,
                }));
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
        } finally {
            setLoading(false);
        }
    }

    const handleSave = async () => {
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
            "file.excel_max_rows": settings.excelMaxRows,
            "file.max_attachment_size_mb": settings.maxAttachmentSizeMb,
            "file.batch_import_max_rows": settings.batchImportMaxRows,
            "notification.deadline_reminder_hours": settings.deadlineReminderHours,
            "notification.retention_days": settings.notificationRetentionDays,
        };

        const validationError = validateAdminSettingsPayload(payload);
        if (validationError) {
            toast.error(validationError.message);
            return;
        }

        setSaving(true);
        try {

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

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold">系统设置</h2>
                    <p className="text-sm text-muted-foreground mt-1">集中管理系统参数与安全策略。</p>
                </div>
            </div>

            <div className="flex flex-col gap-6 xl:flex-row">
                <div className="xl:w-64 shrink-0">
                    <Card className="overflow-hidden">
                        <CardContent className="p-2 space-y-1">
                            {sections.map((section) => {
                                const Icon = section.icon;
                                const isActive = activeSection === section.id;
                                return (
                                    <Button
                                        key={section.id}
                                        variant={isActive ? "secondary" : "ghost"}
                                        data-testid={`settings-section-${section.id}`}
                                        onClick={() => setActiveSection(section.id)}
                                        className="w-full justify-start"
                                    >
                                        <Icon data-icon="inline-start" />
                                        <span>{section.title}</span>
                                    </Button>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>

                <Card className="flex-1 relative">
                    <CardContent className="pt-6 space-y-6">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                                <SectionIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold">{activeMeta.title}</h3>
                                <p className="text-sm text-muted-foreground mt-1">{sectionDescriptions[activeMeta.id]}</p>
                            </div>
                        </div>

                        <Separator />

                        {activeSection === "general" && (
                            <div className="space-y-6">
                                <div className="grid gap-6 max-w-2xl">
                                    <div className="space-y-3">
                                        <Label htmlFor="systemName">系统名称</Label>
                                        <Input
                                            id="systemName"
                                            data-testid="settings-system-name"
                                            value={settings.systemName}
                                            onChange={(e) => setSettings({ ...settings, systemName: e.target.value })}
                                        />
                                        <p className="text-xs text-muted-foreground">显示在浏览器标题栏和登录页</p>
                                    </div>
                                    <div className="flex items-center justify-between p-4 bg-muted border border-border">
                                        <div className="space-y-0.5">
                                            <div className="text-sm font-medium">维护模式</div>
                                            <div className="text-xs text-muted-foreground">开启后仅管理员可访问系统，其他用户将看到维护提示</div>
                                        </div>
                                        <Switch
                                            checked={settings.maintenanceMode}
                                            onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between p-4 bg-muted border border-border">
                                        <div className="space-y-0.5">
                                            <div className="text-sm font-medium">开放注册</div>
                                            <div className="text-xs text-muted-foreground">允许新用户自行注册账号，关闭后仅管理员可添加</div>
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
                                <div className="grid gap-6 max-w-2xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <Label htmlFor="experimentTimeLimit">实验时间限制 (分钟)</Label>
                                            <Input
                                                id="experimentTimeLimit"
                                                type="number"
                                                value={settings.experimentTimeLimit}
                                                onChange={(e) => setSettings({ ...settings, experimentTimeLimit: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="autoSaveInterval">自动保存间隔 (分钟)</Label>
                                            <Input
                                                id="autoSaveInterval"
                                                type="number"
                                                value={settings.autoSaveInterval}
                                                onChange={(e) => setSettings({ ...settings, autoSaveInterval: parseInt(e.target.value) || 0 })}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-4 bg-muted border border-border">
                                        <div className="space-y-0.5">
                                            <div className="text-sm font-medium">提交需审批</div>
                                            <div className="text-xs text-muted-foreground">学生提交实验报告后需要教师审批才能获得成绩</div>
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
                                <div className="grid gap-6 max-w-2xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <Label htmlFor="maxLoginAttempts">最大登录尝试次数</Label>
                                            <Input
                                                id="maxLoginAttempts"
                                                data-testid="settings-max-login-attempts"
                                                type="number"
                                                min={3}
                                                max={10}
                                                value={settings.maxLoginAttempts}
                                                onChange={(e) => setSettings({ ...settings, maxLoginAttempts: parseInt(e.target.value) || 0 })}
                                            />
                                            <p className="text-xs text-muted-foreground">连续失败后账号将被临时锁定（3 - 10）</p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="lockDurationMinutes">锁定自动解锁 (分钟)</Label>
                                            <Input
                                                id="lockDurationMinutes"
                                                data-testid="settings-lock-duration"
                                                type="number"
                                                min={10}
                                                max={60}
                                                value={settings.lockDurationMinutes}
                                                onChange={(e) => setSettings({ ...settings, lockDurationMinutes: parseInt(e.target.value) || 0 })}
                                            />
                                            <p className="text-xs text-muted-foreground">锁定后自动解锁时间（10 - 60 分钟）</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-2">
                                        <h4 className="text-sm font-medium text-muted-foreground border-b border-border pb-2">会话超时设置</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="adminSessionTimeout" className="text-xs">管理员 (15-60 分钟)</Label>
                                                <Input
                                                    id="adminSessionTimeout"
                                                    type="number"
                                                    min={15}
                                                    max={60}
                                                    value={settings.adminSessionTimeout}
                                                    onChange={(e) => setSettings({ ...settings, adminSessionTimeout: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="teacherSessionTimeout" className="text-xs">教师 (60-240 分钟)</Label>
                                                <Input
                                                    id="teacherSessionTimeout"
                                                    type="number"
                                                    min={60}
                                                    max={240}
                                                    value={settings.teacherSessionTimeout}
                                                    onChange={(e) => setSettings({ ...settings, teacherSessionTimeout: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="studentSessionTimeout" className="text-xs">学生 (120-480 分钟)</Label>
                                                <Input
                                                    id="studentSessionTimeout"
                                                    type="number"
                                                    min={120}
                                                    max={480}
                                                    value={settings.studentSessionTimeout}
                                                    onChange={(e) => setSettings({ ...settings, studentSessionTimeout: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-border mt-2">
                                        <Button variant="outline" onClick={() => {
                                            passwordChange.clearError();
                                            setShowPasswordModal(true);
                                        }} data-testid="settings-change-password-open" className="w-full sm:w-auto">
                                            <Lock data-icon="inline-start" />
                                            修改管理员密码
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === "file-limits" && (
                            <div className="space-y-6">
                                <div className="grid gap-6 max-w-2xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <Label htmlFor="excelMaxRows">Excel 最大行数</Label>
                                            <Input
                                                id="excelMaxRows"
                                                type="number"
                                                min={10000}
                                                max={500000}
                                                value={settings.excelMaxRows}
                                                onChange={(e) => setSettings({ ...settings, excelMaxRows: parseInt(e.target.value) || 0 })}
                                            />
                                            <p className="text-xs text-muted-foreground">允许上传的 Excel 文件最大行数（10,000 - 500,000）</p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="maxAttachmentSizeMb">单个附件最大 (MB)</Label>
                                            <Input
                                                id="maxAttachmentSizeMb"
                                                type="number"
                                                value={settings.maxAttachmentSizeMb}
                                                onChange={(e) => setSettings({ ...settings, maxAttachmentSizeMb: parseInt(e.target.value) || 0 })}
                                            />
                                            <p className="text-xs text-muted-foreground">单个上传附件的最大文件大小</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label htmlFor="batchImportMaxRows">批量导入最大行数</Label>
                                        <Input
                                            id="batchImportMaxRows"
                                            type="number"
                                            min={100}
                                            max={1000}
                                            value={settings.batchImportMaxRows}
                                            onChange={(e) => setSettings({ ...settings, batchImportMaxRows: parseInt(e.target.value) || 0 })}
                                            className="max-w-xs"
                                        />
                                        <p className="text-xs text-muted-foreground">批量导入学生/数据时允许的最大行数（100 - 1,000）</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === "notifications" && (
                            <div className="space-y-6">
                                <div className="grid gap-6 max-w-2xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <Label htmlFor="deadlineReminderHours">截止提醒提前时间 (小时)</Label>
                                            <Input
                                                id="deadlineReminderHours"
                                                type="number"
                                                value={settings.deadlineReminderHours}
                                                onChange={(e) => setSettings({ ...settings, deadlineReminderHours: parseInt(e.target.value) || 0 })}
                                            />
                                            <p className="text-xs text-muted-foreground">在任务截止前多少小时发送提醒通知</p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="notificationRetentionDays">通知保留天数</Label>
                                            <Input
                                                id="notificationRetentionDays"
                                                type="number"
                                                value={settings.notificationRetentionDays}
                                                onChange={(e) => setSettings({ ...settings, notificationRetentionDays: parseInt(e.target.value) || 0 })}
                                            />
                                            <p className="text-xs text-muted-foreground">系统通知的保留天数，过期自动清理</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pt-6 mt-6 border-t border-border flex justify-end">
                            <Button data-testid="settings-save" onClick={handleSave} disabled={saving}>
                                {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
                                保存设置
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <PasswordChangeDialog
                open={showPasswordModal}
                onOpenChange={setShowPasswordModal}
                allowClose={true}
                title="修改管理员密码"
                description="为了账号安全，建议定期更改密码。"
                form={passwordChange.form}
                onFieldChange={passwordChange.setField}
                error={passwordChange.error}
                saving={passwordChange.saving}
                onSubmit={passwordChange.submit}
                submitLabel="确认修改"
                submitTestId="settings-change-password-submit"
                fieldTestIds={{
                    currentPassword: "settings-change-password-current",
                    newPassword: "settings-change-password-new",
                    confirmPassword: "settings-change-password-confirm",
                }}
            />
        </div>
    );
}
