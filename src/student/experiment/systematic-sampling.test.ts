import { expect, test } from "bun:test";
import {
    formatSystematicInterval,
    getStoredSystematicInterval,
    getSystematicInterval,
} from "./systematic-sampling";

test("systematic interval supports fractional K values", () => {
    expect(getSystematicInterval(200, 132)).toBeCloseTo(200 / 132);
    expect(getSystematicInterval(100, 10)).toBe(10);
});

test("systematic interval rejects invalid target sizes", () => {
    expect(getSystematicInterval(0, 10)).toBeNull();
    expect(getSystematicInterval(100, null)).toBeNull();
    expect(getSystematicInterval(100, 101)).toBeNull();
});

test("systematic interval formatting is compact", () => {
    expect(formatSystematicInterval(2)).toBe("2");
    expect(formatSystematicInterval(200 / 132)).toBe("1.5152");
    expect(formatSystematicInterval(null)).toBe("-");
});

test("stored systematic interval reads both new and legacy results", () => {
    expect(getStoredSystematicInterval({ interval: 1.5 })).toBe(1.5);
    expect(getStoredSystematicInterval({ kValue: 2 })).toBe(2);
    expect(getStoredSystematicInterval({})).toBeNull();
});
