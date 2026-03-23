import { describe, expect, test } from "bun:test";
import {
    initialDesignEffectFromParent,
    nonResponseDecimalToFormPercent,
} from "./inherit-planning-params";

describe("nonResponseDecimalToFormPercent", () => {
    test("converts decimal to 0–50 percent", () => {
        expect(nonResponseDecimalToFormPercent(0.1)).toBe(10);
        expect(nonResponseDecimalToFormPercent(undefined)).toBe(0);
    });

    test("clamps to 0–50 并处理非有限值", () => {
        expect(nonResponseDecimalToFormPercent(0.6)).toBe(50);
        expect(nonResponseDecimalToFormPercent(-0.1)).toBe(0);
        expect(nonResponseDecimalToFormPercent(Number.NaN)).toBe(0);
        expect(nonResponseDecimalToFormPercent(Number.POSITIVE_INFINITY)).toBe(0);
    });
});

describe("initialDesignEffectFromParent", () => {
    test("clamps to 0.5–5", () => {
        expect(initialDesignEffectFromParent(2)).toBe(2);
        expect(initialDesignEffectFromParent(0.2)).toBe(0.5);
        expect(initialDesignEffectFromParent(undefined)).toBe(1);
    });

    test("上限 5、非有限值回退", () => {
        expect(initialDesignEffectFromParent(10)).toBe(5);
        expect(initialDesignEffectFromParent(Number.NaN)).toBe(1);
    });
});
