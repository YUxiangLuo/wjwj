/**
 * 任务截止时间：教师端用「中国墙钟」编辑，提交与 API 传输使用 ISO-8601 UTC（…Z）。
 * 数据库存储由 Drizzle/Bun SQL 将 JS Date 写入 timestamptz；JSON 响应中 Date 序列化为 UTC ISO。
 */

import { APP_TIMEZONE, APP_TIMEZONE_OFFSET } from "../utils/format";

const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const CHINA_WALL_CLOCK_FORMATTER = new Intl.DateTimeFormat("en", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

export interface ChinaWallClockDateTime {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

function parseLocalDateTimeParts(value: string): ChinaWallClockDateTime | null {
    const m = LOCAL_DATETIME_PATTERN.exec(value.trim());
    if (!m) return null;
    const [, ys, ms, ds, hs, mins] = m;
    const year = Number(ys);
    const month = Number(ms);
    const day = Number(ds);
    const hour = Number(hs);
    const minute = Number(mins);

    if (
        !Number.isInteger(year) ||
        month < 1 || month > 12 ||
        day < 1 || day > 31 ||
        hour < 0 || hour > 23 ||
        minute < 0 || minute > 59
    ) {
        return null;
    }

    const d = new Date(Date.UTC(year, month - 1, day));
    if (
        d.getUTCFullYear() !== year ||
        d.getUTCMonth() !== month - 1 ||
        d.getUTCDate() !== day
    ) {
        return null;
    }

    return { year, month, day, hour, minute };
}

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
    return parts.find((p) => p.type === type)?.value ?? "";
}

function toChinaWallClockParts(instant: Date): ChinaWallClockDateTime | null {
    const parts = CHINA_WALL_CLOCK_FORMATTER.formatToParts(instant);
    const year = Number(partValue(parts, "year"));
    const month = Number(partValue(parts, "month"));
    const day = Number(partValue(parts, "day"));
    const hour = Number(partValue(parts, "hour"));
    const minute = Number(partValue(parts, "minute"));
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    return { year, month, day, hour, minute };
}

/** 解析 `YYYY-MM-DDTHH:mm`（中国日历/时分），与 DatetimePicker24 存储一致 */
export function parseLocalDateTime(value: string): ChinaWallClockDateTime | null {
    return parseLocalDateTimeParts(value);
}

/** 中国墙钟 parts → `YYYY-MM-DDTHH:mm`（供选择器受控值） */
export function toLocalDateTimeString(parts: ChinaWallClockDateTime): string {
    const y = String(parts.year).padStart(4, "0");
    const mo = String(parts.month).padStart(2, "0");
    const day = String(parts.day).padStart(2, "0");
    const hh = String(parts.hour).padStart(2, "0");
    const mm = String(parts.minute).padStart(2, "0");
    return `${y}-${mo}-${day}T${hh}:${mm}`;
}

/** 中国墙钟串 → UTC ISO，用于 `createTask` / `extendTaskDeadline` 请求体 */
export function localWallClockToUtcIso(local: string): string | undefined {
    const t = local.trim();
    if (!t) return undefined;
    const parts = parseLocalDateTimeParts(t);
    if (!parts) return undefined;
    const { year, month, day, hour, minute } = parts;
    const isoWithChinaOffset = [
        `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00${APP_TIMEZONE_OFFSET}`,
    ].join("T");
    const d = new Date(isoWithChinaOffset);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
}

/**
 * 日期时间选择器：受控值可能是中国墙钟串，或接口返回的 ISO UTC 串。
 * ISO UTC 会先投影到中国墙钟 parts，避免宿主机本地时区/DST 规范化改变时分。
 */
export function parsePickerValue(value: string): ChinaWallClockDateTime | null {
    if (!value.trim()) return null;
    const v = value.trim();
    if (LOCAL_DATETIME_PATTERN.test(v)) {
        return parseLocalDateTime(v);
    }
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return toChinaWallClockParts(d);
}
