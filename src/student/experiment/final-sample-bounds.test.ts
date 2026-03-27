import { expect, test, describe } from "bun:test";
import { getFinalSampleSizeBounds } from "./final-sample-bounds";

describe("getFinalSampleSizeBounds", () => {
    test("有总体规模时，合法区间为 1..N", () => {
        expect(getFinalSampleSizeBounds(200)).toEqual({ min: 1, max: 200 });
        expect(getFinalSampleSizeBounds(100)).toEqual({ min: 1, max: 100 });
        expect(getFinalSampleSizeBounds(60)).toEqual({ min: 1, max: 60 });
    });

    test("非整数 N 向下取整", () => {
        expect(getFinalSampleSizeBounds(59.9)).toEqual(getFinalSampleSizeBounds(59));
    });

    test("极小 N 兜底", () => {
        expect(getFinalSampleSizeBounds(0)).toEqual({ min: 1, max: 1 });
        expect(getFinalSampleSizeBounds(1)).toEqual({ min: 1, max: 1 });
    });
});
