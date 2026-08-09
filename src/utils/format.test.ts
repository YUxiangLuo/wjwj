import { expect, test } from "bun:test";
import {
    formatDateStampCN, formatDateTimeCN, formatLocalDateStamp, formatSaveTime, startOfDayCN,
    safeParseDate, parseDeadline, formatDateTimeDisplay, formatDateDisplay, formatTimeDisplay,
} from "./format";

test("formatLocalDateStamp uses the Asia/Shanghai calendar date", () => {
    // 2026-03-09T16:25:06Z = 2026-03-10T00:25:06+08:00 (CST)
    expect(formatLocalDateStamp(new Date("2026-03-09T16:25:06.000Z"))).toBe("2026-03-10");
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

// --- safeParseDate tests ---

test("safeParseDate returns null for null/undefined/empty", () => {
    expect(safeParseDate(null)).toBeNull();
    expect(safeParseDate(undefined)).toBeNull();
    expect(safeParseDate("")).toBeNull();
});

test("safeParseDate returns null for invalid date strings", () => {
    expect(safeParseDate("not-a-date")).toBeNull();
    expect(safeParseDate("abc123")).toBeNull();
});

test("safeParseDate parses valid ISO strings", () => {
    const d = safeParseDate("2026-03-23T06:30:00.000Z");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-03-23T06:30:00.000Z");
});

test("safeParseDate passes through Date objects", () => {
    const original = new Date("2026-01-15T12:00:00Z");
    const result = safeParseDate(original);
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBe(original.getTime());
});

// --- parseDeadline tests ---

test("parseDeadline returns null for null", () => {
    expect(parseDeadline(null)).toBeNull();
});

test("parseDeadline parses ISO deadline with T", () => {
    const d = parseDeadline("2026-06-15T02:30:00.000Z");
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe("2026-06-15T02:30:00.000Z");
});

test("parseDeadline appends end-of-day in Asia/Shanghai for date-only strings", () => {
    const d = parseDeadline("2026-06-15");
    expect(d).not.toBeNull();
    // 2026-06-15T23:59:00+08:00 = 2026-06-15T15:59:00.000Z
    expect(d!.toISOString()).toBe("2026-06-15T15:59:00.000Z");
});

test("parseDeadline returns null for invalid strings", () => {
    expect(parseDeadline("invalid")).toBeNull();
});

// --- formatDateTimeDisplay tests ---

test("formatDateTimeDisplay returns fallback for null/invalid", () => {
    expect(formatDateTimeDisplay(null)).toBe("无");
    expect(formatDateTimeDisplay("invalid")).toBe("无");
    expect(formatDateTimeDisplay(undefined, "-")).toBe("-");
});

test("formatDateTimeDisplay formats valid date in Asia/Shanghai", () => {
    // 2026-06-15T02:30:00Z (UTC) = 2026-06-15T10:30:00+08:00 (CST)
    const result = formatDateTimeDisplay("2026-06-15T02:30:00Z");
    expect(result).toContain("2026");
    expect(result).toContain("06");
    expect(result).toContain("15");
    expect(result).toContain("10:30");
});

// --- formatDateDisplay tests ---

test("formatDateDisplay returns fallback for null/invalid", () => {
    expect(formatDateDisplay(null)).toBe("无");
    expect(formatDateDisplay("invalid")).toBe("无");
});

test("formatDateDisplay formats date in Asia/Shanghai", () => {
    // 2026-03-09T23:00:00Z (UTC) = 2026-03-10T07:00:00+08:00 (CST)
    const result = formatDateDisplay("2026-03-09T23:00:00Z");
    expect(result).toContain("2026");
    expect(result).toContain("3");
    expect(result).toContain("10");
});

// --- formatTimeDisplay tests ---

test("formatTimeDisplay returns fallback for null/invalid", () => {
    expect(formatTimeDisplay(null)).toBe("-");
    expect(formatTimeDisplay("invalid")).toBe("-");
});

test("formatTimeDisplay formats time in Asia/Shanghai", () => {
    // 2026-06-15T02:30:45Z (UTC) = 2026-06-15T10:30:45+08:00 (CST)
    const result = formatTimeDisplay("2026-06-15T02:30:45Z");
    expect(result).toContain("10:30:45");
});
