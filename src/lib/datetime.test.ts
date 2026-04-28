import { expect, test } from "bun:test";
import { localWallClockToUtcIso, parsePickerValue, parseLocalDateTime, toLocalDateTimeString } from "./datetime";

test("localWallClockToUtcIso treats picker wall clock as Asia/Shanghai", () => {
    expect(localWallClockToUtcIso("2026-03-23T14:30")).toBe("2026-03-23T06:30:00.000Z");
});

test("localWallClockToUtcIso is independent from host daylight-saving gaps", () => {
    expect(localWallClockToUtcIso("2026-03-08T02:30")).toBe("2026-03-07T18:30:00.000Z");
});

test("parsePickerValue projects API UTC ISO to Asia/Shanghai wall clock", () => {
    const iso = "2026-03-23T06:30:00.000Z";
    const p = parsePickerValue(iso);
    expect(p).not.toBeNull();
    expect(toLocalDateTimeString(p!)).toBe("2026-03-23T14:30");
});

test("parsePickerValue preserves China wall-clock times that are host DST gaps", () => {
    const iso = "2026-03-07T18:30:00.000Z";
    const p = parsePickerValue(iso);
    expect(p).not.toBeNull();
    expect(toLocalDateTimeString(p!)).toBe("2026-03-08T02:30");
});

test("parseLocalDateTime rejects ISO with Z", () => {
    expect(parseLocalDateTime("2026-03-23T06:30:00.000Z")).toBeNull();
});

test("parseLocalDateTime rejects normalized impossible calendar dates", () => {
    expect(parseLocalDateTime("2026-02-30T12:00")).toBeNull();
});
