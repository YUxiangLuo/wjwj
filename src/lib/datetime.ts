import { APP_TIMEZONE, APP_TIMEZONE_OFFSET } from "@/utils/format";

/**
 * Task schedule wall-clock values are always China Standard Time. API and
 * database values remain absolute UTC instants.
 */

export interface PickerDateTimeValue {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

const WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const PICKER_PARTS_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
});

function partsForInstant(date: Date): PickerDateTimeValue | null {
    if (!Number.isFinite(date.getTime())) return null;
    const parts = PICKER_PARTS_FORMATTER.formatToParts(date);
    const read = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value);
    const result = {
        year: read("year"),
        month: read("month"),
        day: read("day"),
        hour: read("hour"),
        minute: read("minute"),
    };
    return Object.values(result).every(Number.isFinite) ? result : null;
}

function parseWallClockParts(value: string): PickerDateTimeValue | null {
    const match = WALL_CLOCK_PATTERN.exec(value.trim());
    if (!match) return null;
    const [, year, month, day, hour, minute] = match;
    return {
        year: Number(year),
        month: Number(month),
        day: Number(day),
        hour: Number(hour),
        minute: Number(minute),
    };
}

export function formatPickerDateTimeValue(value: PickerDateTimeValue) {
    return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}T${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
}

/** Strictly parse `YYYY-MM-DDTHH:mm` as a China Standard Time instant. */
export function parseLocalDateTime(value: string): Date | null {
    const parts = parseWallClockParts(value);
    if (!parts) return null;

    const input = formatPickerDateTimeValue(parts);
    const date = new Date(`${input}:00${APP_TIMEZONE_OFFSET}`);
    if (!Number.isFinite(date.getTime())) return null;

    // Date parsing normalizes invalid calendar values such as February 30.
    return toLocalDateTimeString(date) === input ? date : null;
}

/** Absolute instant → China Standard Time `YYYY-MM-DDTHH:mm`. */
export function toLocalDateTimeString(date: Date): string {
    const parts = partsForInstant(date);
    return parts ? formatPickerDateTimeValue(parts) : "";
}

/** China Standard Time wall clock → UTC ISO for teacher task APIs. */
export function localWallClockToUtcIso(local: string): string | undefined {
    const trimmed = local.trim();
    if (!trimmed) return undefined;
    return parseLocalDateTime(trimmed)?.toISOString();
}

/**
 * Accept either a controlled China Standard Time wall-clock value or an ISO
 * instant returned by the API, and expose stable calendar fields to the picker.
 */
export function parsePickerValue(value: string): PickerDateTimeValue | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (WALL_CLOCK_PATTERN.test(trimmed)) {
        const date = parseLocalDateTime(trimmed);
        return date ? parseWallClockParts(trimmed) : null;
    }

    const date = new Date(trimmed);
    return partsForInstant(date);
}

export function getCurrentPickerDateTimeValue(date: Date = new Date()) {
    return partsForInstant(date);
}
