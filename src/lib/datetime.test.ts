import { expect, test } from "bun:test";
import {
    getCurrentPickerDateTimeValue,
    localWallClockToUtcIso,
    parseLocalDateTime,
    parsePickerValue,
    toLocalDateTimeString,
    toPickerCalendarDate,
} from "./datetime";

test("China Standard Time wall clock converts to the expected UTC instant", () => {
    expect(localWallClockToUtcIso("2026-08-20T20:45")).toBe("2026-08-20T12:45:00.000Z");
});

test("API UTC instant maps back to China Standard Time picker fields", () => {
    expect(parsePickerValue("2026-08-20T12:45:00.000Z")).toEqual({
        year: 2026,
        month: 8,
        day: 20,
        hour: 20,
        minute: 45,
    });
    expect(toLocalDateTimeString(new Date("2026-08-20T12:45:00.000Z"))).toBe("2026-08-20T20:45");
});

test("calendar today preserves the China Standard Time date in local Date fields", () => {
    const current = getCurrentPickerDateTimeValue(new Date("2026-03-09T16:30:00.000Z"));
    expect(current).not.toBeNull();

    const calendarDate = toPickerCalendarDate(current!);
    expect([
        calendarDate.getFullYear(),
        calendarDate.getMonth() + 1,
        calendarDate.getDate(),
        calendarDate.getHours(),
    ]).toEqual([2026, 3, 10, 12]);
});

test("wall-clock parsing is independent of the process/browser timezone", () => {
    const parsed = parseLocalDateTime("2026-03-23T14:30");
    expect(parsed?.toISOString()).toBe("2026-03-23T06:30:00.000Z");
});

test("strict wall-clock parser rejects invalid dates and ISO input", () => {
    expect(parseLocalDateTime("2026-02-30T12:00")).toBeNull();
    expect(parseLocalDateTime("2026-03-23T24:00")).toBeNull();
    expect(parseLocalDateTime("2026-03-23T06:30:00.000Z")).toBeNull();
});

test("picker accepts valid controlled wall-clock values", () => {
    expect(parsePickerValue("2026-08-20T20:45")).toEqual({
        year: 2026,
        month: 8,
        day: 20,
        hour: 20,
        minute: 45,
    });
});
