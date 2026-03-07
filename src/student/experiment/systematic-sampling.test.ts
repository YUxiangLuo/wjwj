import { expect, test } from "bun:test";
import {
    formatSystematicRange,
    getSystematicAcceptedRange,
    getSystematicSampleCountRange,
    isSystematicRangeWithinAcceptedRange,
} from "./systematic-sampling";

test("systematic sample count range reflects random-start fluctuation", () => {
    expect(getSystematicSampleCountRange(100, 10)).toEqual({ min: 10, max: 10 });
    expect(getSystematicSampleCountRange(100, 11)).toEqual({ min: 9, max: 10 });
});

test("systematic accepted range follows 80%-120% rule", () => {
    expect(getSystematicAcceptedRange(960)).toEqual({ min: 768, max: 1152 });
    expect(getSystematicAcceptedRange(null)).toBeNull();
});

test("systematic range validation requires the whole fluctuation band to stay within limits", () => {
    const acceptedRange = getSystematicAcceptedRange(13);

    expect(isSystematicRangeWithinAcceptedRange({ min: 10, max: 10 }, acceptedRange)).toBe(true);
    expect(isSystematicRangeWithinAcceptedRange({ min: 9, max: 10 }, acceptedRange)).toBe(false);
});

test("systematic range formatting collapses equal bounds", () => {
    expect(formatSystematicRange({ min: 10, max: 10 })).toBe("10");
    expect(formatSystematicRange({ min: 9, max: 10 })).toBe("9-10");
});
