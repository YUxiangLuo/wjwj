import { expect, test, describe } from "bun:test";
import { getFinalSampleSizeBounds, isSmallPopulationSampleBounds } from "./final-sample-bounds";

describe("getFinalSampleSizeBounds", () => {
    test("常规大总体：下限 30，上限 ⌊N/2⌋", () => {
        expect(getFinalSampleSizeBounds(200)).toEqual({ min: 30, max: 100 });
        expect(getFinalSampleSizeBounds(100)).toEqual({ min: 30, max: 50 });
        expect(getFinalSampleSizeBounds(60)).toEqual({ min: 30, max: 30 });
    });

    test("小总体：⌊N/2⌋ 小于 30 时，下限与上限对齐，避免空区间", () => {
        expect(getFinalSampleSizeBounds(59)).toEqual({ min: 29, max: 29 });
        expect(getFinalSampleSizeBounds(50)).toEqual({ min: 25, max: 25 });
        expect(getFinalSampleSizeBounds(49)).toEqual({ min: 24, max: 24 });
    });

    test("非整数 N 向下取整", () => {
        expect(getFinalSampleSizeBounds(59.9)).toEqual(getFinalSampleSizeBounds(59));
    });

    test("极小 N 兜底", () => {
        expect(getFinalSampleSizeBounds(0)).toEqual({ min: 1, max: 1 });
        expect(getFinalSampleSizeBounds(1)).toEqual({ min: 1, max: 1 });
    });
});

describe("isSmallPopulationSampleBounds", () => {
    test("⌊N/2⌋ 小于 30 且 N>0 时为 true", () => {
        expect(isSmallPopulationSampleBounds(59)).toBe(true);
        expect(isSmallPopulationSampleBounds(50)).toBe(true);
    });

    test("否则为 false", () => {
        expect(isSmallPopulationSampleBounds(0)).toBe(false);
        expect(isSmallPopulationSampleBounds(60)).toBe(false);
        expect(isSmallPopulationSampleBounds(200)).toBe(false);
    });
});
