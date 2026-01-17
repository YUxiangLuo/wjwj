import { useState } from "react";

interface SettingSection {
    id: string;
    title: string;
    icon: string;
}

const sections: SettingSection[] = [
    { id: "general", title: "基本设置", icon: "⚙️" },
    { id: "experiment", title: "实验设置", icon: "🧪" },
    { id: "security", title: "安全设置", icon: "🔒" },
    { id: "backup", title: "备份恢复", icon: "💾" },
];

export function SystemSettings() {
    const [activeSection, setActiveSection] = useState("general");
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

    const handleSave = () => {
        alert("设置已保存！");
    };

    return (
        <div className="flex gap-6">
            {/* Sidebar */}
            <div className="w-56 shrink-0">
                <div className="bg-white rounded-xl shadow-sm p-2">
                    {sections.map((section) => (
                        <button
                            key={section.id}
                            onClick={() => setActiveSection(section.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${activeSection === section.id ? "bg-teal-50 text-teal-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                                }`}
                        >
                            <span>{section.icon}</span>
                            <span>{section.title}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 bg-white rounded-xl shadow-sm p-6">
                {activeSection === "general" && (
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-slate-800 pb-4 border-b">基本设置</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">系统名称</label>
                                <input
                                    type="text"
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                    value={settings.systemName}
                                    onChange={(e) => setSettings({ ...settings, systemName: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center justify-between py-3 border-b border-slate-100">
                                <div>
                                    <div className="text-sm font-medium text-slate-700">维护模式</div>
                                    <div className="text-xs text-slate-500">开启后仅管理员可访问系统</div>
                                </div>
                                <button
                                    onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
                                    className={`w-12 h-6 rounded-full transition-colors ${settings.maintenanceMode ? "bg-teal-600" : "bg-slate-300"}`}
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.maintenanceMode ? "translate-x-6" : "translate-x-0.5"}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between py-3 border-b border-slate-100">
                                <div>
                                    <div className="text-sm font-medium text-slate-700">开放注册</div>
                                    <div className="text-xs text-slate-500">允许新用户自行注册账号</div>
                                </div>
                                <button
                                    onClick={() => setSettings({ ...settings, allowRegistration: !settings.allowRegistration })}
                                    className={`w-12 h-6 rounded-full transition-colors ${settings.allowRegistration ? "bg-teal-600" : "bg-slate-300"}`}
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.allowRegistration ? "translate-x-6" : "translate-x-0.5"}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === "experiment" && (
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-slate-800 pb-4 border-b">实验设置</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">实验时间限制（分钟）</label>
                                <input
                                    type="number"
                                    className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                    value={settings.experimentTimeLimit}
                                    onChange={(e) => setSettings({ ...settings, experimentTimeLimit: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">自动保存间隔（分钟）</label>
                                <input
                                    type="number"
                                    className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                    value={settings.autoSaveInterval}
                                    onChange={(e) => setSettings({ ...settings, autoSaveInterval: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="flex items-center justify-between py-3 border-b border-slate-100">
                                <div>
                                    <div className="text-sm font-medium text-slate-700">提交需审批</div>
                                    <div className="text-xs text-slate-500">学生提交实验后需要教师审批</div>
                                </div>
                                <button
                                    onClick={() => setSettings({ ...settings, requireApproval: !settings.requireApproval })}
                                    className={`w-12 h-6 rounded-full transition-colors ${settings.requireApproval ? "bg-teal-600" : "bg-slate-300"}`}
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.requireApproval ? "translate-x-6" : "translate-x-0.5"}`} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === "security" && (
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-slate-800 pb-4 border-b">安全设置</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">最大登录尝试次数</label>
                                <input
                                    type="number"
                                    className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                    value={settings.maxLoginAttempts}
                                    onChange={(e) => setSettings({ ...settings, maxLoginAttempts: parseInt(e.target.value) || 0 })}
                                />
                                <p className="text-xs text-slate-500 mt-1">超过次数后账号将被锁定</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">会话超时时间（分钟）</label>
                                <input
                                    type="number"
                                    className="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                    value={settings.sessionTimeout}
                                    onChange={(e) => setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === "backup" && (
                    <div className="space-y-6">
                        <h3 className="text-lg font-semibold text-slate-800 pb-4 border-b">备份恢复</h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between py-3 border-b border-slate-100">
                                <div>
                                    <div className="text-sm font-medium text-slate-700">自动备份</div>
                                    <div className="text-xs text-slate-500">定期自动备份数据库和文件</div>
                                </div>
                                <button
                                    onClick={() => setSettings({ ...settings, enableBackup: !settings.enableBackup })}
                                    className={`w-12 h-6 rounded-full transition-colors ${settings.enableBackup ? "bg-teal-600" : "bg-slate-300"}`}
                                >
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.enableBackup ? "translate-x-6" : "translate-x-0.5"}`} />
                                </button>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">备份频率</label>
                                <select
                                    className="w-48 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                                    value={settings.backupFrequency}
                                    onChange={(e) => setSettings({ ...settings, backupFrequency: e.target.value })}
                                >
                                    <option value="hourly">每小时</option>
                                    <option value="daily">每天</option>
                                    <option value="weekly">每周</option>
                                </select>
                            </div>
                            <div className="pt-4">
                                <button className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 mr-3">
                                    立即备份
                                </button>
                                <button className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                                    恢复备份
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Save Button */}
                <div className="mt-8 pt-6 border-t">
                    <button onClick={handleSave} className="px-6 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700">
                        保存设置
                    </button>
                </div>
            </div>
        </div>
    );
}
