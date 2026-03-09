const APP_TIMEZONE = "Asia/Shanghai";

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

const DATE_STAMP_FORMATTER = new Intl.DateTimeFormat("en", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
});

export function formatLocalDateStamp(date: Date = new Date()): string {
    const parts = DATE_STAMP_FORMATTER.formatToParts(date);
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
    const parts = DATE_STAMP_FORMATTER.formatToParts(date);
    const year = Number(parts.find((p) => p.type === "year")!.value);
    const month = Number(parts.find((p) => p.type === "month")!.value);
    const day = Number(parts.find((p) => p.type === "day")!.value);
    return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+08:00`);
}
