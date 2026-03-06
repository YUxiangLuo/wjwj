import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, FlaskConical, Shield, Database, Save, Loader2, Lock, ArrowLeft, FileText, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
    { id: "file-limits", title: "文件限制", icon: FileText },
    { id: "notifications", title: "通知设置", icon: Bell },
    { id: "backup", title: "备份恢复", icon: Database },
];

const sectionDescriptions: Record<string, string> = {
    general: "系统名称、维护模式与注册策略",
    experiment: "实验时长、自动保存与审批流程",
    security: "登录保护与会话超时策略",
    "file-limits": "Excel行数、附件大小与批量导入限制",
    notifications: "截止提醒与通知保留策略",
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
        excelMaxRows: 100000,
        maxAttachmentSizeMb: 10,
        batchImportMaxRows: 500,
        deadlineReminderHours: 24,
        notificationRetentionDays: 90,
    });

    const activeMeta = sections.find((section) => section.id === activeSection) ?? sections[0]!;
    const SectionIcon = activeMeta.icon;

    useEffect(() => {
        loadSettings();
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
                    enableBackup: (data.enable_backup as boolean) ?? prev.enableBackup,
                    backupFrequency: (data.backup_frequency as string) ?? prev.backupFrequency,
                    backupRetentionDays: (data["backup.retention_days"] as number) ?? prev.backupRetentionDays,
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
        // Validate ranges per V3 spec
        const validations: { field: string; value: number; min: number; max: number; label: string }[] = [
            { field: "maxLoginAttempts", value: settings.maxLoginAttempts, min: 3, max: 10, label: "最大登录尝试次数" },
            { field: "lockDurationMinutes", value: settings.lockDurationMinutes, min: 10, max: 60, label: "锁定时长" },
            { field: "adminSessionTimeout", value: settings.adminSessionTimeout, min: 15, max: 60, label: "管理员会话超时" },
            { field: "teacherSessionTimeout", value: settings.teacherSessionTimeout, min: 60, max: 240, label: "教师会话超时" },
            { field: "studentSessionTimeout", value: settings.studentSessionTimeout, min: 120, max: 480, label: "学生会话超时" },
            { field: "excelMaxRows", value: settings.excelMaxRows, min: 10000, max: 500000, label: "Excel 最大行数" },
            { field: "batchImportMaxRows", value: settings.batchImportMaxRows, min: 100, max: 1000, label: "批量导入最大行数" },
        ];

        for (const v of validations) {
            if (v.value < v.min || v.value > v.max) {
                toast.error(`${v.label}须在 ${v.min} - ${v.max} 范围内`);
                return;
            }
        }

        setSaving(true);
        try {
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
                "file.excel_max_rows": settings.excelMaxRows,
                "file.max_attachment_size_mb": settings.maxAttachmentSizeMb,
                "file.batch_import_max_rows": settings.batchImportMaxRows,
                "notification.deadline_reminder_hours": settings.deadlineReminderHours,
                "notification.retention_days": settings.notificationRetentionDays,
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
                    const firstBackupId = data.find((item) => item.hasZip)?.backupId;
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

        const selectedBackup = backupList.find((item) => item.backupId === restoreForm.backupId.trim());
        if (selectedBackup && !selectedBackup.hasZip) {
            setRestoreError("该备份缺少资源文件，无法用于恢复");
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
                toast.success("密码修改成功");
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
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-100">系统设置</h2>
                    <p className="text-sm text-slate-400 mt-1">集中管理系统参数、安全策略与备份方案。</p>
                </div>
            </div>

            <div className="flex flex-col gap-6 xl:flex-row">
                {/* Navigation Sidebar */}
                <div className="xl:w-64 shrink-0">
                    <Card className="border-slate-800 bg-slate-900 shadow-sm overflow-hidden">
                        <CardContent className="p-2 space-y-1">
                            {sections.map((section) => {
                                const Icon = section.icon;
                                const isActive = activeSection === section.id;
                                return (
                                    <Button
                                        key={section.id}
                                        variant="ghost"
                                        data-testid={`settings-section-${section.id}`}
                                        onClick={() => setActiveSection(section.id)}
                                        className={`w-full justify-start gap-3 transition-all duration-200 ${isActive
                                            ? "bg-indigo-600/10 text-indigo-400 font-medium border border-indigo-500/10"
                                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
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

                {/* Main Content Area */}
                <Card className="flex-1 border-slate-800 bg-slate-900 shadow-sm relative">
                    <CardContent className="pt-6 space-y-6">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 shadow-inner">
                                <SectionIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-slate-100">{activeMeta.title}</h3>
                                <p className="text-sm text-slate-500 mt-1">{sectionDescriptions[activeMeta.id]}</p>
                            </div>
                        </div>

                        <Separator className="bg-slate-800" />

                        {activeSection === "general" && (
                            <div className="space-y-6">
                                <div className="grid gap-6 max-w-2xl">
                                    <div className="space-y-3">
                                        <Label htmlFor="systemName" className="text-slate-300">系统名称</Label>
                                        <Input
                                            id="systemName"
                                            data-testid="settings-system-name"
                                            value={settings.systemName}
                                            onChange={(e) => setSettings({ ...settings, systemName: e.target.value })}
                                            className="bg-slate-950 border-slate-800 text-slate-200 placeholder:text-slate-600 focus:border-indigo-500/50"
                                        />
                                        <p className="text-xs text-slate-500">显示在浏览器标题栏和登录页</p>
                                    </div>
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                                        <div className="space-y-0.5">
                                            <div className="text-sm font-medium text-slate-200">维护模式</div>
                                            <div className="text-xs text-slate-500">开启后仅管理员可访问系统，其他用户将看到维护提示</div>
                                        </div>
                                        <Switch
                                            checked={settings.maintenanceMode}
                                            onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
                                            className="data-[state=checked]:bg-indigo-600"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                                        <div className="space-y-0.5">
                                            <div className="text-sm font-medium text-slate-200">开放注册</div>
                                            <div className="text-xs text-slate-500">允许新用户自行注册账号，关闭后仅管理员可添加</div>
                                        </div>
                                        <Switch
                                            checked={settings.allowRegistration}
                                            onCheckedChange={(checked) => setSettings({ ...settings, allowRegistration: checked })}
                                            className="data-[state=checked]:bg-indigo-600"
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
                                            <Label htmlFor="experimentTimeLimit" className="text-slate-300">实验时间限制 (分钟)</Label>
                                            <Input
                                                id="experimentTimeLimit"
                                                type="number"
                                                value={settings.experimentTimeLimit}
                                                onChange={(e) => setSettings({ ...settings, experimentTimeLimit: parseInt(e.target.value) || 0 })}
                                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="autoSaveInterval" className="text-slate-300">自动保存间隔 (分钟)</Label>
                                            <Input
                                                id="autoSaveInterval"
                                                type="number"
                                                value={settings.autoSaveInterval}
                                                onChange={(e) => setSettings({ ...settings, autoSaveInterval: parseInt(e.target.value) || 0 })}
                                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                                        <div className="space-y-0.5">
                                            <div className="text-sm font-medium text-slate-200">提交需审批</div>
                                            <div className="text-xs text-slate-500">学生提交实验报告后需要教师审批才能获得成绩</div>
                                        </div>
                                        <Switch
                                            checked={settings.requireApproval}
                                            onCheckedChange={(checked) => setSettings({ ...settings, requireApproval: checked })}
                                            className="data-[state=checked]:bg-indigo-600"
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
                                            <Label htmlFor="maxLoginAttempts" className="text-slate-300">最大登录尝试次数</Label>
                                            <Input
                                                id="maxLoginAttempts"
                                                data-testid="settings-max-login-attempts"
                                                type="number"
                                                min={3}
                                                max={10}
                                                value={settings.maxLoginAttempts}
                                                onChange={(e) => setSettings({ ...settings, maxLoginAttempts: parseInt(e.target.value) || 0 })}
                                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                            />
                                            <p className="text-xs text-slate-500">连续失败后账号将被临时锁定（3 - 10）</p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="lockDurationMinutes" className="text-slate-300">锁定自动解锁 (分钟)</Label>
                                            <Input
                                                id="lockDurationMinutes"
                                                data-testid="settings-lock-duration"
                                                type="number"
                                                min={10}
                                                max={60}
                                                value={settings.lockDurationMinutes}
                                                onChange={(e) => setSettings({ ...settings, lockDurationMinutes: parseInt(e.target.value) || 0 })}
                                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                            />
                                            <p className="text-xs text-slate-500">锁定后自动解锁时间（10 - 60 分钟）</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-2">
                                        <h4 className="text-sm font-medium text-slate-400 border-b border-slate-800 pb-2">会话超时设置</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="adminSessionTimeout" className="text-slate-300 text-xs">管理员 (15-60 分钟)</Label>
                                                <Input
                                                    id="adminSessionTimeout"
                                                    type="number"
                                                    min={15}
                                                    max={60}
                                                    value={settings.adminSessionTimeout}
                                                    onChange={(e) => setSettings({ ...settings, adminSessionTimeout: parseInt(e.target.value) || 0 })}
                                                    className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="teacherSessionTimeout" className="text-slate-300 text-xs">教师 (60-240 分钟)</Label>
                                                <Input
                                                    id="teacherSessionTimeout"
                                                    type="number"
                                                    min={60}
                                                    max={240}
                                                    value={settings.teacherSessionTimeout}
                                                    onChange={(e) => setSettings({ ...settings, teacherSessionTimeout: parseInt(e.target.value) || 0 })}
                                                    className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="studentSessionTimeout" className="text-slate-300 text-xs">学生 (120-480 分钟)</Label>
                                                <Input
                                                    id="studentSessionTimeout"
                                                    type="number"
                                                    min={120}
                                                    max={480}
                                                    value={settings.studentSessionTimeout}
                                                    onChange={(e) => setSettings({ ...settings, studentSessionTimeout: parseInt(e.target.value) || 0 })}
                                                    className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-slate-800 mt-2">
                                        <Button variant="outline" onClick={() => setShowPasswordModal(true)} className="border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800 w-full sm:w-auto">
                                            <Lock className="w-4 h-4 mr-2" />
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
                                            <Label htmlFor="excelMaxRows" className="text-slate-300">Excel 最大行数</Label>
                                            <Input
                                                id="excelMaxRows"
                                                type="number"
                                                min={10000}
                                                max={500000}
                                                value={settings.excelMaxRows}
                                                onChange={(e) => setSettings({ ...settings, excelMaxRows: parseInt(e.target.value) || 0 })}
                                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                            />
                                            <p className="text-xs text-slate-500">允许上传的 Excel 文件最大行数（10,000 - 500,000）</p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="maxAttachmentSizeMb" className="text-slate-300">单个附件最大 (MB)</Label>
                                            <Input
                                                id="maxAttachmentSizeMb"
                                                type="number"
                                                value={settings.maxAttachmentSizeMb}
                                                onChange={(e) => setSettings({ ...settings, maxAttachmentSizeMb: parseInt(e.target.value) || 0 })}
                                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                            />
                                            <p className="text-xs text-slate-500">单个上传附件的最大文件大小</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Label htmlFor="batchImportMaxRows" className="text-slate-300">批量导入最大行数</Label>
                                        <Input
                                            id="batchImportMaxRows"
                                            type="number"
                                            min={100}
                                            max={1000}
                                            value={settings.batchImportMaxRows}
                                            onChange={(e) => setSettings({ ...settings, batchImportMaxRows: parseInt(e.target.value) || 0 })}
                                            className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50 max-w-xs"
                                        />
                                        <p className="text-xs text-slate-500">批量导入学生/数据时允许的最大行数（100 - 1,000）</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === "notifications" && (
                            <div className="space-y-6">
                                <div className="grid gap-6 max-w-2xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <Label htmlFor="deadlineReminderHours" className="text-slate-300">截止提醒提前时间 (小时)</Label>
                                            <Input
                                                id="deadlineReminderHours"
                                                type="number"
                                                value={settings.deadlineReminderHours}
                                                onChange={(e) => setSettings({ ...settings, deadlineReminderHours: parseInt(e.target.value) || 0 })}
                                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                            />
                                            <p className="text-xs text-slate-500">在任务截止前多少小时发送提醒通知</p>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="notificationRetentionDays" className="text-slate-300">通知保留天数</Label>
                                            <Input
                                                id="notificationRetentionDays"
                                                type="number"
                                                value={settings.notificationRetentionDays}
                                                onChange={(e) => setSettings({ ...settings, notificationRetentionDays: parseInt(e.target.value) || 0 })}
                                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                            />
                                            <p className="text-xs text-slate-500">系统通知的保留天数，过期自动清理</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeSection === "backup" && (
                            <div className="space-y-6">
                                <div className="grid gap-6 max-w-2xl">
                                    <div className="flex items-center justify-between p-4 rounded-lg bg-slate-950/50 border border-slate-800">
                                        <div className="space-y-0.5">
                                            <div className="text-sm font-medium text-slate-200">自动备份</div>
                                            <div className="text-xs text-slate-500">定期自动备份数据库和文件，防止数据丢失</div>
                                        </div>
                                        <Switch
                                            checked={settings.enableBackup}
                                            onCheckedChange={(checked) => setSettings({ ...settings, enableBackup: checked })}
                                            className="data-[state=checked]:bg-indigo-600"
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-3">
                                            <Label className="text-slate-300">备份频率</Label>
                                            <Select value={settings.backupFrequency} onValueChange={(v) => setSettings({ ...settings, backupFrequency: v })}>
                                                <SelectTrigger className="bg-slate-950 border-slate-800 text-slate-200">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                                    <SelectItem value="hourly">每小时</SelectItem>
                                                    <SelectItem value="daily">每天</SelectItem>
                                                    <SelectItem value="weekly">每周</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-3">
                                            <Label htmlFor="backupRetentionDays" className="text-slate-300">保留天数</Label>
                                            <Input
                                                id="backupRetentionDays"
                                                type="number"
                                                value={settings.backupRetentionDays}
                                                onChange={(e) => setSettings({ ...settings, backupRetentionDays: parseInt(e.target.value) || 0 })}
                                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-slate-950/30 border border-slate-800 rounded-lg p-4 space-y-4 mt-2">
                                        <h4 className="text-sm font-medium text-slate-300">手动备份与恢复</h4>
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            <Button data-testid="settings-backup-create" onClick={handleCreateBackup} disabled={backupLoading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                                                {backupLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                                                立即备份
                                            </Button>
                                            <Button data-testid="settings-backup-restore-open" variant="outline" onClick={handleRestoreBackup} disabled={restoreLoading} className="border-slate-700 text-slate-300 hover:text-slate-100 hover:bg-slate-800">
                                                <ArrowLeft className="w-4 h-4 mr-2" />
                                                恢复备份
                                            </Button>
                                        </div>
                                        {lastBackupId && (
                                            <div className="text-xs text-emerald-400 font-mono flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                                                最近备份ID：{lastBackupId}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pt-6 mt-6 border-t border-slate-800 flex justify-end">
                            <Button data-testid="settings-save" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                                保存设置
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100">修改管理员密码</DialogTitle>
                        <DialogDescription className="text-slate-400">为了账号安全，建议定期更改密码。</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="currentPassword" className="text-slate-300">当前密码</Label>
                            <Input
                                id="currentPassword"
                                type="password"
                                value={passwordForm.currentPassword}
                                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                autoComplete="current-password"
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
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
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
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
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-indigo-500/50"
                            />
                        </div>
                        {passwordError && <div className="text-sm text-rose-400 bg-rose-500/10 p-2 rounded border border-rose-500/20">{passwordError}</div>}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowPasswordModal(false)} disabled={passwordSaving} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">
                            取消
                        </Button>
                        <Button onClick={handleChangePassword} disabled={passwordSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            {passwordSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            确认修改
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showRestoreModal} onOpenChange={setShowRestoreModal}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-slate-100 flex items-center gap-2">
                            <Database className="w-5 h-5 text-amber-500" />
                            恢复备份
                        </DialogTitle>
                        <DialogDescription className="text-slate-400">
                            恢复将清空当前数据库并覆盖数据，这是一个不可逆的操作。
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="restoreBackupId" className="text-slate-300">选择备份</Label>
                            <Select
                                value={restoreForm.backupId}
                                onValueChange={(value) => setRestoreForm({ ...restoreForm, backupId: value })}
                            >
                                <SelectTrigger id="restoreBackupId" className="bg-slate-950 border-slate-800 text-slate-200">
                                    <SelectValue placeholder={backupListLoading ? "加载中..." : "请选择备份"} />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                                    {backupList.map((item) => (
                                        <SelectItem key={item.backupId} value={item.backupId} disabled={!item.hasZip}>
                                            <span className="font-mono">{item.backupId}</span> {item.hasZip ? "" : "(不可用)"}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {backupListLoading ? (
                                <div className="text-xs text-slate-500">正在加载备份列表...</div>
                            ) : backupList.length > 0 ? (
                                <div className="text-xs text-slate-500">
                                    {backupList.find(item => item.backupId === restoreForm.backupId)?.createdAt ?
                                        `备份时间：${new Date(backupList.find(item => item.backupId === restoreForm.backupId)!.createdAt).toLocaleString("zh-CN")}`
                                        : ""
                                    }
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500">暂无可用备份</div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="restorePassword" className="text-slate-300">管理员密码</Label>
                            <Input
                                id="restorePassword"
                                type="password"
                                value={restoreForm.password}
                                onChange={(e) => setRestoreForm({ ...restoreForm, password: e.target.value })}
                                autoComplete="current-password"
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-red-500/50 focus:ring-red-500/20"
                                placeholder="输入密码以确认操作"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="restoreConfirmPassword" className="text-slate-300">确认管理员密码</Label>
                            <Input
                                id="restoreConfirmPassword"
                                type="password"
                                value={restoreForm.confirmPassword}
                                onChange={(e) => setRestoreForm({ ...restoreForm, confirmPassword: e.target.value })}
                                autoComplete="current-password"
                                className="bg-slate-950 border-slate-800 text-slate-200 focus:border-red-500/50 focus:ring-red-500/20"
                                placeholder="再次输入密码"
                            />
                        </div>
                        {restoreError && <div className="text-sm text-rose-400 bg-rose-500/10 p-2 rounded border border-rose-500/20">{restoreError}</div>}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowRestoreModal(false)} disabled={restoreLoading} className="text-slate-400 hover:text-slate-200 hover:bg-slate-800">
                            取消
                        </Button>
                        <Button onClick={handleConfirmRestore} disabled={restoreLoading} className="bg-rose-600 hover:bg-rose-700 text-white">
                            {restoreLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            确认恢复
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
