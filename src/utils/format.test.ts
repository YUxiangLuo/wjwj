import { expect, test } from "bun:test";
import { formatLocalDateStamp, formatSaveTime } from "./format";

test("formatLocalDateStamp uses local calendar date", () => {
    expect(formatLocalDateStamp(new Date(2026, 2, 9, 4, 25, 6))).toBe("2026-03-09");
});

test("formatSaveTime returns a hh:mm:ss string", () => {
    expect(formatSaveTime()).toMatch(/^\d{2}:\d{2}:\d{2}$/);
});
