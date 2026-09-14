import { expect, test } from "bun:test";
import { designEffectValueTone, nonResponseRateValueTone } from "./sample-planning-styles";

test("planning slider values stay neutral at their defaults", () => {
    // 设计效应 1.0 与无回答率 0% 是基准值，不应使用警示色（UI/UX F-UI-05）。
    expect(designEffectValueTone(1)).toBe("text-foreground");
    expect(designEffectValueTone(0.5)).toBe("text-foreground");
    expect(nonResponseRateValueTone(0)).toBe("text-foreground");
});

test("planning slider values warn once they deviate above the default", () => {
    expect(designEffectValueTone(1.1)).toBe("text-warning");
    expect(designEffectValueTone(5)).toBe("text-warning");
    expect(nonResponseRateValueTone(0.05)).toBe("text-warning");
    expect(nonResponseRateValueTone(0.5)).toBe("text-warning");
});
