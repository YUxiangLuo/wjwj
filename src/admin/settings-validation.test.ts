import { expect, test } from "bun:test";
import { validateAdminSettingsPayload } from "./settings-validation";

test("validateAdminSettingsPayload accepts valid notification and retention settings", () => {
    expect(validateAdminSettingsPayload({
        "file.max_attachment_size_mb": 10,
        "notification.deadline_reminder_hours": 12,
        "notification.retention_days": 88,
    })).toBeNull();
});

test("validateAdminSettingsPayload rejects zero notification settings", () => {
    expect(validateAdminSettingsPayload({
        "notification.deadline_reminder_hours": 0,
    })).toEqual({
        key: "notification.deadline_reminder_hours",
        message: "截止提醒提前时间须大于等于 1",
    });

    expect(validateAdminSettingsPayload({
        "notification.retention_days": 0,
    })).toEqual({
        key: "notification.retention_days",
        message: "通知保留天数须大于等于 1",
    });
});

test("validateAdminSettingsPayload rejects non-positive attachment limits", () => {
    expect(validateAdminSettingsPayload({
        "file.max_attachment_size_mb": 0,
    })).toEqual({
        key: "file.max_attachment_size_mb",
        message: "单个附件最大大小须大于等于 1",
    });
});

test("validateAdminSettingsPayload rejects out-of-range batch import rows", () => {
    expect(validateAdminSettingsPayload({
        "file.batch_import_max_rows": 50,
    })).toEqual({
        key: "file.batch_import_max_rows",
        message: "批量导入最大行数须在 100 - 1000 范围内",
    });
});

test("validateAdminSettingsPayload rejects non-integer numeric settings", () => {
    expect(validateAdminSettingsPayload({
        "notification.retention_days": "30",
    })).toEqual({
        key: "notification.retention_days",
        message: "通知保留天数必须为整数",
    });
});
