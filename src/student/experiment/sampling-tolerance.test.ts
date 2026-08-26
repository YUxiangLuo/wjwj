import { expect, test } from "bun:test";
import { formatSamplingRange, getSamplingAcceptedRange } from "./sampling-tolerance";

test("PPS tolerance remains 80%-120% of the target and never exceeds the population", () => {
    expect(getSamplingAcceptedRange(13)).toEqual({ min: 10, max: 16 });
    expect(getSamplingAcceptedRange(12, 12)).toEqual({ min: 9, max: 12 });
    expect(getSamplingAcceptedRange(9, 10)).toEqual({ min: 7, max: 10 });
    expect(getSamplingAcceptedRange(null, 12)).toBeNull();
    expect(formatSamplingRange({ min: 10, max: 16 })).toBe("10-16");
});
