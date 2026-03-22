import { expect, test } from "bun:test";
import { localWallClockToUtcIso, parsePickerValue, parseLocalDateTime } from "./datetime";

test("localWallClockToUtcIso converts local wall clock to Z suffix ISO", () => {
    const d = new Date(2026, 2, 23, 14, 30, 0, 0);
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const iso = localWallClockToUtcIso(local);
    expect(iso).toBeDefined();
    expect(iso!.endsWith("Z")).toBe(true);
    expect(new Date(iso!).getTime()).toBe(d.getTime());
});

test("parsePickerValue accepts ISO UTC from API", () => {
    const iso = "2026-03-23T06:30:00.000Z";
    const p = parsePickerValue(iso);
    expect(p).not.toBeNull();
    expect(p!.getTime()).toBe(new Date(iso).getTime());
});

test("parseLocalDateTime rejects ISO with Z", () => {
    expect(parseLocalDateTime("2026-03-23T06:30:00.000Z")).toBeNull();
});
