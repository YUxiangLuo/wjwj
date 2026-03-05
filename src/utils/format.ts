const SAVE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
});

export function formatSaveTime(): string {
    return SAVE_TIME_FORMATTER.format(new Date());
}
