export const APP_TIMEZONE = "Asia/Shanghai";
/** Must match APP_TIMEZONE — used in startOfDayCN to construct an ISO-8601 timestamp. */
const APP_TIMEZONE_OFFSET = "+08:00";

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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
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

/**
 * Parse a deadline string: date-only strings (no 'T') are treated as end-of-day
 * in Asia/Shanghai by appending T23:59:00+08:00.
 */
export function parseDeadline(deadline: string | null): Date | null {
    if (!deadline) return null;
    const raw = deadline.includes("T") ? deadline : `${deadline}T23:59:00${APP_TIMEZONE_OFFSET}`;
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
