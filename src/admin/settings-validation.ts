export interface AdminSettingsValidationError {
    key: string;
    message: string;
}

type NumericSettingRule = {
    key: string;
    label: string;
    min: number;
    max?: number;
};

const NUMERIC_SETTING_RULES: NumericSettingRule[] = [
    { key: "login.max_fail_count", label: "最大登录尝试次数", min: 3, max: 10 },
    { key: "login.lock_duration_minutes", label: "锁定时长", min: 10, max: 60 },
    { key: "session.admin_timeout_minutes", label: "管理员会话超时", min: 15, max: 60 },
    { key: "session.teacher_timeout_minutes", label: "教师会话超时", min: 60, max: 240 },
    { key: "session.student_timeout_minutes", label: "学生会话超时", min: 120, max: 480 },
    { key: "file.excel_max_rows", label: "Excel 最大行数", min: 10000, max: 500000 },
    { key: "file.max_attachment_size_mb", label: "单个附件最大大小", min: 1 },
    { key: "file.batch_import_max_rows", label: "批量导入最大行数", min: 100, max: 1000 },
    { key: "notification.deadline_reminder_hours", label: "截止提醒提前时间", min: 1 },
    { key: "notification.retention_days", label: "通知保留天数", min: 1 },
];

function formatRangeMessage(rule: NumericSettingRule) {
    if (rule.max === undefined) {
        return `${rule.label}须大于等于 ${rule.min}`;
    }

    return `${rule.label}须在 ${rule.min} - ${rule.max} 范围内`;
}

export function validateAdminSettingsPayload(payload: Record<string, unknown>): AdminSettingsValidationError | null {
    for (const rule of NUMERIC_SETTING_RULES) {
        if (!(rule.key in payload)) continue;

        const value = payload[rule.key];
        if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
            return {
                key: rule.key,
                message: `${rule.label}必须为整数`,
            };
        }

        if (value < rule.min || (rule.max !== undefined && value > rule.max)) {
            return {
                key: rule.key,
                message: formatRangeMessage(rule),
            };
        }
    }

    return null;
}
