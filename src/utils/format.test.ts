import { expect, test } from "bun:test";
import { formatDateStampCN, formatDateTimeCN, formatLocalDateStamp, formatSaveTime, startOfDayCN } from "./format";

test("formatLocalDateStamp uses local calendar date", () => {
    expect(formatLocalDateStamp(new Date(2026, 2, 9, 4, 25, 6))).toBe("2026-03-09");
});

test("formatSaveTime returns a hh:mm:ss string", () => {
    expect(formatSaveTime()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
});

test("formatDateTimeCN formats a UTC date in Asia/Shanghai timezone", () => {
    // 2026-03-09T16:00:00Z (UTC) = 2026-03-10T00:00:00+08:00 (CST)
    const utcDate = new Date("2026-03-09T16:00:00Z");
    const formatted = formatDateTimeCN(utcDate);
    expect(formatted).toContain("2026/03/10");
    expect(formatted).toContain("00:00:00");
});

test("formatDateTimeCN always uses Asia/Shanghai regardless of server timezone", () => {
    // 2026-06-15T02:30:00Z (UTC) = 2026-06-15T10:30:00+08:00 (CST)
    const utcDate = new Date("2026-06-15T02:30:00Z");
    const formatted = formatDateTimeCN(utcDate);
    expect(formatted).toContain("2026/06/15");
    expect(formatted).toContain("10:30:00");
});

test("formatDateStampCN uses Asia/Shanghai timezone for date boundary", () => {
    // 2026-03-09T23:00:00Z (UTC) = 2026-03-10T07:00:00+08:00 (CST)
    const utcDate = new Date("2026-03-09T23:00:00Z");
    expect(formatDateStampCN(utcDate)).toBe("2026-03-10");
});

test("startOfDayCN returns midnight in Asia/Shanghai", () => {
    // 2026-03-09T20:00:00Z (UTC) = 2026-03-10T04:00:00+08:00 (CST)
    const utcDate = new Date("2026-03-09T20:00:00Z");
    const start = startOfDayCN(utcDate);
    // Start of day in CST is 2026-03-10T00:00:00+08:00 = 2026-03-09T16:00:00Z
    expect(start.toISOString()).toBe("2026-03-09T16:00:00.000Z");
});

test("startOfDayCN returns midnight for a date early in the CST day", () => {
    // 2026-03-10T01:30:00Z (UTC) = 2026-03-10T09:30:00+08:00 (CST)
    const utcDate = new Date("2026-03-10T01:30:00Z");
    const start = startOfDayCN(utcDate);
    // Start of day in CST is 2026-03-10T00:00:00+08:00 = 2026-03-09T16:00:00Z
    expect(start.toISOString()).toBe("2026-03-09T16:00:00.000Z");
});
