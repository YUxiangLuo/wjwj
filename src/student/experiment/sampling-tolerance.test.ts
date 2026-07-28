import { expect, test } from "bun:test";
import { formatSamplingRange, getSamplingAcceptedRange } from "./sampling-tolerance";

test("PPS tolerance remains 80%-120% of the target", () => {
    expect(getSamplingAcceptedRange(13)).toEqual({ min: 10, max: 16 });
    expect(getSamplingAcceptedRange(null)).toBeNull();
    expect(formatSamplingRange({ min: 10, max: 16 })).toBe("10-16");
});
