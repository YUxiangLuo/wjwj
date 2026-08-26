import { expect, test } from "bun:test";
import { formatSamplingRange, getSamplingAcceptedRange } from "./sampling-tolerance";

test("PPS integer tolerance remains strictly inside 80%-120% and never exceeds the population", () => {
    expect(getSamplingAcceptedRange(13)).toEqual({ min: 11, max: 15 });
    expect(getSamplingAcceptedRange(12, 12)).toEqual({ min: 10, max: 12 });
    expect(getSamplingAcceptedRange(9, 10)).toEqual({ min: 8, max: 10 });
    expect(getSamplingAcceptedRange(2)).toEqual({ min: 2, max: 2 });
    expect(getSamplingAcceptedRange(null, 12)).toBeNull();
    expect(formatSamplingRange({ min: 11, max: 15 })).toBe("11-15");
});
