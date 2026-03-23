import { expect, test, describe } from "bun:test";
import { computeSampleProgressDisplay } from "./sample-progress-display";

describe("computeSampleProgressDisplay", () => {
    test("sampleSize≤0 时全零", () => {
        expect(computeSampleProgressDisplay(10, 5, 0)).toEqual({ current: 0, total: 0 });
        expect(computeSampleProgressDisplay(10, 5, -1)).toEqual({ current: 0, total: 0 });
    });

    test("无动画步数时 current 为 0，total 为样本量", () => {
        expect(computeSampleProgressDisplay(0, 0, 100)).toEqual({ current: 0, total: 100 });
    });

    test("按比例映射到真实样本量并封顶", () => {
        expect(computeSampleProgressDisplay(10, 5, 100)).toEqual({ current: 50, total: 100 });
        expect(computeSampleProgressDisplay(10, 10, 100)).toEqual({ current: 100, total: 100 });
        expect(computeSampleProgressDisplay(10, 20, 100)).toEqual({ current: 100, total: 100 });
    });

    test("中间步数四舍五入", () => {
        expect(computeSampleProgressDisplay(3, 1, 10)).toEqual({ current: 3, total: 10 });
    });
});
