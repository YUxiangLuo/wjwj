export const APP_TIMEZONE = "Asia/Shanghai";
/** Must match APP_TIMEZONE — used in startOfDayCN to construct an ISO-8601 timestamp. */
export const APP_TIMEZONE_OFFSET = "+08:00";

const SAVE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
});

export function formatSaveTime(): string {
    return SAVE_TIME_FORMATTER.format(new Date());
}

export function formatLocalDateStamp(date: Date = new Date()): string {
    return formatDateStampCN(date);
}

const DATE_STAMP_CN_FORMATTER = new Intl.DateTimeFormat("en", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

export function formatDateStampCN(date: Date = new Date()): string {
    const parts = DATE_STAMP_CN_FORMATTER.formatToParts(date);
    const year = parts.find((p) => p.type === "year")!.value;
    const month = parts.find((p) => p.type === "month")!.value;
    const day = parts.find((p) => p.type === "day")!.value;
    return `${year}-${month}-${day}`;
}

const DATE_TIME_CN_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
});

export function formatDateTimeCN(date: Date): string {
    return DATE_TIME_CN_FORMATTER.format(date);
}

export function startOfDayCN(date: Date = new Date()): Date {
    const parts = DATE_STAMP_CN_FORMATTER.formatToParts(date);
    const year = parts.find((p) => p.type === "year")!.value;
    const month = parts.find((p) => p.type === "month")!.value;
    const day = parts.find((p) => p.type === "day")!.value;
    return new Date(`${year}-${month}-${day}T00:00:00${APP_TIMEZONE_OFFSET}`);
}

// ---------------------------------------------------------------------------
// Shared display helpers for frontend UI (timezone-aware, Asia/Shanghai)
// ---------------------------------------------------------------------------

const DISPLAY_DATETIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
});

const DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

const DISPLAY_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
});

/** Safe date/time parsing — returns null for unparseable values. */
export function safeParseDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;

function isValidCalendarDate(year: number, month: number, day: number) {
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function isValidDateTimeMatch(match: RegExpExecArray) {
    const [, ys, ms, ds, hs = "0", mins = "0", ss = "0"] = match;
    const year = Number(ys);
    const month = Number(ms);
    const day = Number(ds);
    const hour = Number(hs);
    const minute = Number(mins);
    const second = Number(ss);
    return Number.isInteger(year)
        && isValidCalendarDate(year, month, day)
        && hour >= 0 && hour <= 23
        && minute >= 0 && minute <= 59
        && second >= 0 && second <= 59;
}

/**
 * Parse a deadline string: date-only strings (no 'T') are treated as end-of-day
 * in Asia/Shanghai by appending T23:59:00+08:00.
 */
export function parseDeadline(deadline: string | null): Date | null {
    if (!deadline) return null;
    const value = deadline.trim();
    if (!value) return null;

    const dateOnlyMatch = DATE_ONLY_PATTERN.exec(value);
    if (dateOnlyMatch) {
        if (!isValidDateTimeMatch(dateOnlyMatch)) return null;
        return safeParseDate(`${value}T23:59:00${APP_TIMEZONE_OFFSET}`);
    }

    const dateTimeMatch = DATE_TIME_PATTERN.exec(value);
    if (!dateTimeMatch || !isValidDateTimeMatch(dateTimeMatch)) return null;

    const hasTimeZone = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
    const raw = hasTimeZone ? value : `${value}${APP_TIMEZONE_OFFSET}`;
    return safeParseDate(raw);
}

/** Display a date-time string in Asia/Shanghai timezone (YYYY/MM/DD HH:mm). Returns fallback on invalid input. */
export function formatDateTimeDisplay(value: string | Date | null | undefined, fallback = "无"): string {
    const d = safeParseDate(value);
    if (!d) return fallback;
    return DISPLAY_DATETIME_FORMATTER.format(d);
}

/** Display a date string in Asia/Shanghai timezone (YYYY/MM/DD). Returns fallback on invalid input. */
export function formatDateDisplay(value: string | Date | null | undefined, fallback = "无"): string {
    const d = safeParseDate(value);
    if (!d) return fallback;
    return DISPLAY_DATE_FORMATTER.format(d);
}

/** Display a time string in Asia/Shanghai timezone (HH:mm:ss). Returns fallback on invalid input. */
export function formatTimeDisplay(value: string | Date | null | undefined, fallback = "-"): string {
    const d = safeParseDate(value);
    if (!d) return fallback;
    return DISPLAY_TIME_FORMATTER.format(d);
}
